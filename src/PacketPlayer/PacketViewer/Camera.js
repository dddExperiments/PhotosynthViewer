"use strict";

/*
	The MIT License (MIT)

	Copyright (c) Microsoft Corporation

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in
	all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	THE SOFTWARE.

	PS.Packet.Camera:
	-----------------

	This is the class used to store a Camera object.
	It contains the low geometry (dominant plane) and the high one (3d planes)

	Cameras are displayed using a progressive loading mechanism:
		1: dominant plane + atlas    (lowGeometry  + lowMaterial)
		2: spin geometry  + atlas    (highGeometry + lowMaterial)
		3: spin geometry  + HD image (highGeometry + highMaterial)

*/

PS.Packet.CameraForWorker = function(cam) {
	this.position    = cam.pose.position;
	this.cameraFront = cam.cameraFront;
	this.cameraUp    = cam.cameraUp;
	this.cameraRight = cam.cameraRight;
	this.my          = cam.my;
	this.mx          = cam.mx;
};

PS.Packet.IntersectPoint = function(p, isFront) {
	this.p = p;
	this.isFront = isFront;
};

PS.Packet.Camera = function(jsonNode, index, debugPolygonColorEnabled, featheringBlendingEnabled) {
	var _that     = this;
	var _position = new THREE.Vector3(jsonNode.position[0], jsonNode.position[1], jsonNode.position[2]);
	var _rotation = new THREE.Quaternion(jsonNode.orientation[0], jsonNode.orientation[1], jsonNode.orientation[2], jsonNode.orientation[3]);

	this.dominantPlane = new PS.Packet.Plane(new THREE.Vector3(jsonNode.dominant_plane[0], jsonNode.dominant_plane[1], jsonNode.dominant_plane[2]), jsonNode.dominant_plane[3]);
	this.aspectRatio  = parseFloat(jsonNode.intrinsics[1]);
	this.fovy         = parseFloat(jsonNode.intrinsics[0]);
	this.fovx         = 2*Math.atan(this.aspectRatio*Math.tan(this.fovy*Math.PI/360))*180/Math.PI;
	this.k1           = parseFloat(jsonNode.intrinsics[2]);
	this.k2           = parseFloat(jsonNode.intrinsics[3]);
	this.near         = parseFloat(jsonNode.depth_range[0]);
	this.far          = parseFloat(jsonNode.depth_range[1]);
	this.index        = index;               //original camera index
	this.qIndex       = jsonNode.path_index; //position of the camera on the 1D 'Q'uantized path (float)
	this.iIndex       = jsonNode.index;      //'I'mage index -> used to look for 'img%04d.jpg'
	this.sIndex       = 0;                   //index of the camera once 'S'orted by qIndex
	this.originalSize = jsonNode.original_size ? new THREE.Vector2(parseFloat(jsonNode.original_size[0]), parseFloat(jsonNode.original_size[1])) : new THREE.Vector2(0, 0);
	this.pyramid      = new PS.Packet.Seadragon.TileSource(this.originalSize);
	this.nextCamera   = null;
	this.prevCamera   = null;
	this.viewer       = null;

	var cameraRot = new THREE.Matrix4().makeRotationFromQuaternion(_rotation);

	this.cameraRight  = new THREE.Vector3().getColumnFromMatrix(0, cameraRot);
	this.cameraUp     = new THREE.Vector3().getColumnFromMatrix(1, cameraRot);
	this.cameraFront  = new THREE.Vector3().getColumnFromMatrix(2, cameraRot).negate(); //-Z in OpenGL

	this.pose = new PS.Packet.Pose(_position, _rotation);

	this.textureMatrix = this.computeTextureMatrix(this.pose);
	this.featurePoints = [];

	var fov = this.fovy*Math.PI/180;
	this.my = Math.tan(fov/2);
	this.mx = this.my*this.aspectRatio;

	//color balancing
	this.balanceToPrevious = new THREE.Vector4(1, 1, 1, 1);
	this.balanceToNext     = new THREE.Vector4(1, 1, 1, 1);
	this.unsmoothedScale   = new THREE.Vector4(1, 1, 1, 1);
	this.smoothedScale     = new THREE.Vector4(1, 1, 1, 1);

	if (jsonNode.balance_to_previous) {
		this.balanceToPrevious.x = jsonNode.balance_to_previous[0];
		this.balanceToPrevious.y = jsonNode.balance_to_previous[1];
		this.balanceToPrevious.z = jsonNode.balance_to_previous[2];
	}
	if (jsonNode.balance_to_next){
		this.balanceToNext.x = jsonNode.balance_to_next[0];
		this.balanceToNext.y = jsonNode.balance_to_next[1];
		this.balanceToNext.z = jsonNode.balance_to_next[2];
	}
	if (jsonNode.timestamp) {
		this.timestamp = parseInt(jsonNode.timestamp, 10);
	}
	//Progressive loading:
	//--------------------

	//1: dominant plane + atlas    (lowGeometry  + lowMaterial)
	//2: spin geometry  + atlas    (highGeometry + lowMaterial)
	//3: spin geometry  + HD image (highGeometry + highMaterial)

	this.lowGeometry  = createLowGeometry(debugPolygonColorEnabled);
	this.highGeometry = _that.lowGeometry; //will be replaced by the real geometry once downloaded and parsed/generated
	this.lowMaterial  = createLowMaterial(debugPolygonColorEnabled, featheringBlendingEnabled);
	this.highMaterial = createHighMaterial(debugPolygonColorEnabled, featheringBlendingEnabled);
	this.mesh = new THREE.Mesh(this.lowGeometry, this.lowMaterial);
	this.mesh.matrixAutoUpdate = false;
	this.colorScale = this.highMaterial.uniforms.colorScale;
	this.colorScale.value = new THREE.Vector4(1, 1, 1, 1);

	this.isSelected    = false;
	this.isDownloading = false;
	this.wasDownloadedOnce = false;
	var _isDownloadingMesh = true;

	function createLowGeometry(debugPolygonColorEnabled) {
		/*
			C --- D
			|     |
			F --- E
		*/
		var isValid = true;
		var tmp;
		tmp = _that.intersectPoint(_that.dominantPlane, -1,  1);
		var c = tmp.p; isValid &= tmp.isFront;
		tmp = _that.intersectPoint(_that.dominantPlane,  1,  1);
		var d = tmp.p; isValid &= tmp.isFront;
		tmp = _that.intersectPoint(_that.dominantPlane,  1, -1);
		var e = tmp.p; isValid &= tmp.isFront;
		tmp = _that.intersectPoint(_that.dominantPlane,  -1, -1);
		var f = tmp.p; isValid &= tmp.isFront;

		if (!isValid) {
			var distanceFromCamera = _that.far*0.99;
			var planeHeight = 2 * distanceFromCamera * Math.tan(_that.fovy*0.5*Math.PI/180);
			var planeWidth  = planeHeight * _that.aspectRatio;

			var pos = _that.pose.position.clone();
			var rot = _that.pose.orientation.clone();

			c = new THREE.Vector3(-planeWidth/2,  planeHeight/2, -distanceFromCamera).applyQuaternion(rot).add(pos);
			d = new THREE.Vector3( planeWidth/2,  planeHeight/2, -distanceFromCamera).applyQuaternion(rot).add(pos);
			e = new THREE.Vector3( planeWidth/2, -planeHeight/2, -distanceFromCamera).applyQuaternion(rot).add(pos);
			f = new THREE.Vector3(-planeWidth/2, -planeHeight/2, -distanceFromCamera).applyQuaternion(rot).add(pos);
		}

		var geometry = new THREE.BufferGeometry();
		geometry.dynamic = true;
		geometry.attributes = {
			index: {
				itemSize: 1,
				array: new Uint16Array([0,2,1,0,3,2]), //TODO: reuse this buffer for all low geometry?
				numItems: 6
			},
			position: {
				itemSize: 3,
				array: new Float32Array([c.x, c.y, c.z,
										d.x, d.y, d.z,
										e.x, e.y, e.z,
										f.x, f.y, f.z]),
				numItems: 4
			}
		};
		if (debugPolygonColorEnabled) {
			var color = {
				r: Math.random(),
				g: Math.random(),
				b: Math.random()
			};
			geometry.attributes.color = {
				itemSize: 3,
				array: new Float32Array([color.r, color.g, color.b,
										color.r, color.g, color.b,
										color.r, color.g, color.b,
										color.r, color.g, color.b]),
				numItems: 4
			};
		}
		geometry.offsets.push({
			'start': 0,
			'count': 6,
			'index': 0
		});

		var nbIndices  = 6;
		var nbVertices = 4;
		geometry.size = nbIndices*2+nbVertices*3*4 + debugPolygonColorEnabled ? nbVertices*3*4 : 0;
		PS.Packet.WebGLMU.addBuffer(geometry.size);

		return geometry;
	}

	function createHighMaterial(debugPolygonColorEnabled, featheringBlendingEnabled) {
		var shaders = PS.Packet.Shaders.Factory.generateProjectiveShaders({
			thumbnailAtlasShader: false,
			debugPolygonColorEnabled: debugPolygonColorEnabled,
			featheringBlendingEnabled: featheringBlendingEnabled
		});
		var uniforms = THREE.UniformsUtils.clone(shaders.uniforms);
		uniforms.textureMatrix.value = _that.textureMatrix;
		uniforms.colorTex.value = null;

		var material = new THREE.ShaderMaterial({
			fragmentShader: shaders.fragmentShader,
			vertexShader: shaders.vertexShader,
			uniforms: uniforms,
			depthWrite: true,
			vertexColors: debugPolygonColorEnabled ? THREE.VertexColors : THREE.NoColors
		});

		return material;
	}

	function createLowMaterial(debugPolygonColorEnabled, featheringBlendingEnabled) {
		var shaders = PS.Packet.Shaders.Factory.generateProjectiveShaders({
			thumbnailAtlasShader: true,
			debugPolygonColorEnabled: debugPolygonColorEnabled,
			featheringBlendingEnabled: featheringBlendingEnabled
		});
		var uniforms = THREE.UniformsUtils.clone(shaders.uniforms);
		uniforms.textureMatrix.value = _that.textureMatrix;

		var material = new THREE.ShaderMaterial({
			fragmentShader: shaders.fragmentShader,
			vertexShader: shaders.vertexShader,
			uniforms: uniforms,
			depthWrite: true,
			vertexColors: debugPolygonColorEnabled ? THREE.VertexColors : THREE.NoColors
		});

		return material;
	}

	this.loadTexture = function(url, onDownloaded, onUploadedToGPU) {

		_that.isDownloading = true;
		_that.viewer.onBeginDownloading(_that.viewer, {type: "image", index: _that.index, sIndex: _that.sIndex});
		//console.log("downloading: " + url);
		new PS.Utils.ImageDownloader(url, function(err, img) {
			if (err) {
				console.log("Failed loading: "+err.src);
				_that.isDownloading = false; //TODO: do some testing
			}
			if (img) {

				_that.wasDownloadedOnce = true;

				onDownloaded(img);

				if (_that.isSelected) {
					var tex = new THREE.Texture(img);
					tex.flipY = true;
					tex.needsUpdate = false;
					tex.generateMipmaps = false;
					tex.minFilter = THREE.LinearFilter;
					tex.onUpdate = function() {
						onUploadedToGPU(tex);
						var img = tex.image;
						PS.Packet.WebGLMU.addTexture(img.width*img.height*3);
						_that.viewer.onGPUMemoryChange();
					};
					_that.viewer.loadTexture(tex);
				}
				_that.isDownloading = false;
				_that.viewer.onFinishDownloading(_that.viewer, {type: "image", index: _that.index, sIndex: _that.sIndex});
			}
		}, _that.viewer.isCorsEnabled());
	};

	this.resetScale = function() {
		_that.smoothedScale = new THREE.Vector4(1, 1, 1, 1);
	};

	this.initializeScaleToCamera = function(camera) {

		if (camera === _that.nextCamera) {
			_that.smoothedScale.x = camera.smoothedScale.x * _that.balanceToNext.x;
			_that.smoothedScale.y = camera.smoothedScale.y * _that.balanceToNext.y;
			_that.smoothedScale.z = camera.smoothedScale.z * _that.balanceToNext.z;
		}
		else if (camera === _that.prevCamera){
			_that.smoothedScale.x = camera.smoothedScale.x * _that.balanceToPrevious.x;
			_that.smoothedScale.y = camera.smoothedScale.y * _that.balanceToPrevious.y;
			_that.smoothedScale.z = camera.smoothedScale.z * _that.balanceToPrevious.z;
		}
		else {
			//need to go multiple steps. decide forward vs backward
			var forwardCam = _that.nextCamera;
			var backwardCam = _that.prevCamera;
			var steps = 1;
			while (forwardCam !== camera && backwardCam !== camera) {
				if (forwardCam && forwardCam.nextCamera) {
					forwardCam = forwardCam.nextCamera;
				}
				if (backwardCam && backwardCam.prevCamera) {
					backwardCam = backwardCam.prevCamera;
				}
				steps = steps+1;
			}

			//if too many steps, better off just resetting smoothing state (may be artifacts from accumulating too many steps)
			if(steps > 4) {
				_that.resetScale();
				return;
			}

			//walk the path, accumulating scaling
			var currCam = _that;
			_that.smoothedScale = camera.smoothedScale;

			if (forwardCam === camera) {
				while (currCam !== camera) {
					_that.smoothedScale.x = _that.smoothedScale.x * currCam.balanceToNext.x;
					_that.smoothedScale.y = _that.smoothedScale.y * currCam.balanceToNext.y;
					_that.smoothedScale.z = _that.smoothedScale.z * currCam.balanceToNext.z;
					currCam = currCam.nextCamera;
				}
			}
			else if (backwardCam === camera) {
				while (currCam !== camera) {
					_that.smoothedScale.x = _that.smoothedScale.x * currCam.balanceToPrevious.x;
					_that.smoothedScale.y = _that.smoothedScale.y * currCam.balanceToPrevious.y;
					_that.smoothedScale.z = _that.smoothedScale.z * currCam.balanceToPrevious.z;
					currCam = currCam.prevCamera;
				}
			}
		}
	};

	this.setPercentToNext = function(percent) {
		//linearly interpolate between identity at own position and balanceToNext at next camera's position
		_that.unsmoothedScale = (new THREE.Vector4(1,1,1,1)).lerp(_that.balanceToNext, percent);
	};

	this.setPercentToPrevious = function(percent) {
		//linearly interpolate between identity at own position and balanceToPrevious at prev camera's position
		_that.unsmoothedScale = (new THREE.Vector4(1,1,1,1)).lerp(_that.balanceToPrevious, percent);
	};

	this.updateLowMaterial = function(thumbnail, atlas, thumbSize) {
		var uniforms = _that.lowMaterial.uniforms;
		uniforms.colorTex.value  = atlas;
		uniforms.thumbnail.value = thumbnail.getUniform(thumbSize);
	};

	function updateHighMaterial(texture) {
		var uniforms = _that.highMaterial.uniforms;
		if (uniforms.colorTex.value) {

			var img = texture.image;

			PS.Packet.WebGLMU.addTexture(-img.width*img.height*3);
			_that.viewer.onGPUMemoryChange();

			uniforms.colorTex.value.dispose();
			uniforms.colorTex.value = null;
		}
		uniforms.colorTex.value = texture;
	}

	this.updateMesh = function(geometry, useDominantPlaneGeometry) {
		_isDownloadingMesh = false;
		this.highGeometry = geometry;
		this.highGeometry.dynamic = true; //TODO: figure out why it's needed
		if (!useDominantPlaneGeometry) {
			this.mesh = new THREE.Mesh(this.highGeometry, this.highMaterial.uniforms.colorTex.value ? this.highMaterial : this.lowMaterial);
		}
		this.mesh.matrixAutoUpdate = false;
		this.viewer.renderer.forceUpdateIfVisible(this, this.sIndex);
	};

	this.assignPreloadedContent = function(texture, geometry) {
		//TODO: make sure that I'm not leaking the texture and geometry
		this.highMaterial.uniforms.colorTex.value = texture;
		this.highGeometry = geometry;
		this.highGeometry.dynamic = true;
		this.mesh = new THREE.Mesh(this.highGeometry, this.highMaterial);
		this.mesh.matrixAutoUpdate = false;
	};

	this.useAtlas = function(useDominantPlaneGeometry, force) {
		if (_that.mesh.material === _that.highMaterial || force) {

			if (_that.mesh.material === _that.highMaterial) { //should not be called when force=true and _that.mesh.material
				var highTexture = _that.highMaterial.uniforms.colorTex.value;
				highTexture.dispose();
				var img = highTexture.image;
				PS.Packet.WebGLMU.addTexture(-img.width*img.height*3);
				_that.viewer.onGPUMemoryChange();
				_that.highMaterial.uniforms.colorTex.value = null; //free image object?
			}

			_that.mesh = new THREE.Mesh(useDominantPlaneGeometry ? _that.lowGeometry : _that.highGeometry, _that.lowMaterial);
			_that.viewer.renderer.forceUpdateIfVisible(_that, _that.sIndex);
		}
	};

	this.useHD = function(useDominantPlaneGeometry, force) {
		if ((_that.mesh.material === _that.lowMaterial && !_that.isDownloading && _that.highGeometry) || force) {
			var url = _that.viewer.dataset.getImageUrl(this.iIndex);

			if (_that.mesh.material === _that.highMaterial) { //triggered in force mode
				_that.mesh = new THREE.Mesh(useDominantPlaneGeometry ? _that.lowGeometry : _that.highGeometry, _that.highMaterial);
				_that.mesh.matrixAutoUpdate = false;
				_that.viewer.renderer.forceUpdateIfVisible(_that, _that.sIndex);

				return true;
			}
			else if (!_isDownloadingMesh && _that.wasDownloadedOnce) {
				_that.loadTexture(url, function() {}, function(texture) {
					_that.updateHighMaterial(texture, useDominantPlaneGeometry);
				});
				return true;
			}
			else {
				return false;
			}
		}
	};

	this.updateHighMaterial = function(texture, useDominantPlaneGeometry) {
		updateHighMaterial(texture);
		_that.mesh = new THREE.Mesh(useDominantPlaneGeometry ? _that.lowGeometry : _that.highGeometry, _that.highMaterial);
		_that.mesh.matrixAutoUpdate = false;
		_that.viewer.renderer.forceUpdateIfVisible(_that, _that.sIndex);
	};
};

PS.Packet.Camera.prototype.computeTextureMatrix = function(pose) {

	var camOrientation = pose.orientation.clone();
	camOrientation.inverse();
	var center = pose.position.clone();
	var t = center.applyQuaternion(camOrientation);
	t.x = -t.x;
	t.y = -t.y;
	t.z = -t.z;

	var focalX = 0;
	var focalY = 0;
	if (this.aspectRatio < 1.0) {
		var focal = 1.0 / (2*Math.tan(this.fovy*Math.PI/360));
		focalY = focal;
		focalX = focal/this.aspectRatio;
	}
	else {
		var focal = 1.0 / (2*Math.tan(this.fovx*Math.PI/360));
		focalX = focal;
		focalY = focal*this.aspectRatio;
	}

	var K = new THREE.Matrix4(-focalX,      0, 0.5, 0,
									0, focalY, 0.5, 0,
									0,      0,   1, 0,
									0,      0,   0, 1);

	var Rt = new THREE.Matrix4().compose(t, camOrientation, new THREE.Vector3(1, 1, 1));

	var P = new THREE.Matrix4();
	P.multiplyMatrices(K, Rt); //P = K[Rt]
	P.multiplyScalar(-1);
	P.n44 = 1.0;

	return P;
};

PS.Packet.Camera.prototype.intersectPoint = function(plane, px, py) {
		//CVec3d ray = (camera.front + camera.right*px*camera.mx + camera.up*py*camera.my).Unit();
		var ray = (this.cameraFront.clone().add(this.cameraRight.clone().multiplyScalar(px*this.mx)).add(this.cameraUp.clone().multiplyScalar(py*this.my))).normalize();

		var planeNormal = plane.normal;
		var planeDepth  = plane.depth;

		var nom   = planeNormal.dot(this.pose.position) + planeDepth;
		var denom = planeNormal.dot(ray);
		var t     = -(nom/denom);

		//CVec3d p = CVec3d(c.pos) + ray*t;
		return new PS.Packet.IntersectPoint(ray.multiplyScalar(t).add(this.pose.position), t >= 0);
};

PS.Packet.Camera.prototype.dispose = function() {
	//high
	if (this.highMaterial) {
		var highTexture = this.highMaterial.uniforms.colorTex.value;
		if (highTexture) {
			PS.Packet.WebGLMU.addTexture(-highTexture.image.width*highTexture.image.height*3);
			highTexture.dispose();
			highTexture = null;
		}
		this.highMaterial.dispose();
		this.highMaterial = null;
	}

	if (this.highGeometry) {
		PS.Packet.WebGLMU.addBuffer(-this.highGeometry.size);
		this.highGeometry.dispose();
		this.highGeometry = null;
	}

	//low
	if (this.lowMaterial) {
		this.lowMaterial.dispose();
		this.lowMaterial = null;
	}

	if (this.lowGeometry) {
		PS.Packet.WebGLMU.addBuffer(-this.lowGeometry.size);
		this.lowGeometry.dispose();
		this.lowGeometry = null;
	}
};
