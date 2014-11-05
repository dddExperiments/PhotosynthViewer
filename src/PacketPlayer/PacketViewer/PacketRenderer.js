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
*/

PS.Packet.BlendingMode = {
	Opacity:            0,
	DitheringLuminance: 1,
	DitheringColor:     2,
	Feathering:         3
};

PS.Packet.BlendingFunction = {
	Linear:  0,
	Step:    1,
	Sigmoid: 2
};

PS.Packet.Renderer = function(viewer, div, width, height, inputDiv, options) {

	var _options = { //default options
		onUpdate:         function() {},
		onCamerasChanged: function() {},
		onLog:            function() {},

		holeFillingEnabled:         true,
		croppingEnabled:            true,
		lazyRenderingEnabled:       true,
		screenshotEnabled:          false,

		startCameraMode:   0,

		blendingFunction:  PS.Packet.BlendingFunction.Sigmoid,
		blendingMode:      PS.Packet.BlendingMode.Opacity,
		blendingSigma:     0.5,

		fov:               50,
		near:              0.03,
		far:               5000
	};
	PS.extend(_options, options); //override default options

	this.setOptions = function(options) {
		var lazyRenderingEnabled = _options.lazyRenderingEnabled;
		PS.extend(_options, options);
		if (lazyRenderingEnabled && !_options.lazyRenderingEnabled) {
			_needsToRender = true;
		}
	};

	this.getOptions = function() { //returning a copy of the options
		var options = {};
		PS.extend(options, _options);

		return options;
	};

	this.reset = function(dataset) {
		_options.near = dataset.near;
		_options.far  = dataset.far;
		_options.fov  = dataset.medianFov;

		_persCamera = new THREE.PerspectiveCamera(_options.fov, _width / _height, _options.near, _options.far);
		_scenes[0].clear();
		_scenes[1].clear();

		_persCamera.position.copy(dataset.startingCamera.pose.position);
		_persCamera.quaternion.copy(dataset.startingCamera.pose.orientation);
		_persCamera.fov = _options.fov;
	};

	var _viewer = viewer;

	var _controls;
	var _container;
	var _renderer;
	var _that = this;
	var _needsToRender = true;

	var _width  = width;
	var _height = height;
	var _scissor = {
		x: 0,
		y: 0,
		w: _width,
		h: _height
	};
	var _renderSize = new THREE.Vector2(width, height);

	var _rtTexture0;
	var _rtTexture1;
	var _rtTextureFilled;

	var _orthoCamera;
	var _persCamera;

	var _scene;
	var _scenes = [];

	var _blendFactor;

	var _pyrDimensions;
	var _pyrLevels;
	var _pyrDown;
	var _pyrUp;
	var _quad;
	var _downsamplingMaterial;
	var _upsamplingMaterial;
	var _blendingMaterial;
	var _commonMaterial;

	var _cameraMode;
	var _globalViewCamera = 0;

	var _randomTexture;
	var _wasBlendingOutOfRange = false;

	var _requestAnimFrameId;

	this.addInScene = function(obj) {
		_scenes[0].scene.add(obj);
	};

	this.getRenderer = function() {
		return _renderer;
	};

	this.getScenes = function() {
		return _scenes;
	};

	this.overlayScene = new function() {

		var _this = new THREE.Scene();
		var _objs = [];
		var _projector = new THREE.Projector();
		var _raycaster = new THREE.Raycaster();

		var defaultAddFunction = _this.add;

		_this.add = function(obj) {
			_objs.push(obj);
			defaultAddFunction.call(_this, obj);
			_this.updateMatrixWorld();
		};

		_this.clear = function() {
			for (var i=0; i<_objs.length; ++i) {
				_this.remove(_objs[i]);
				_objs[i].geometry.dispose(); //TODO: dispose materials and texture as well of just return the list of items removed...
			}
			_objs = [];
		};

		_this.isEmpty = function() {
			return _objs.length === 0;
		};

		_this.intersect = function(e, resizeState) {

			if (_this.isEmpty()) {
				return false;
			}

			var r = resizeState;

			var xOffset = (r.containerWidth  - r.scale*r.width)  / 2;
			var yOffset = (r.containerHeight - r.scale*r.height) / 2;

			var x = (e.layerX - xOffset) / r.scale;
			var y = (e.layerY - yOffset) / r.scale;

			if (x > 0 && x < _width && y > 0 && y < _height) {

				var vector = new THREE.Vector3(( x / _width)*2 - 1, - (y / _height)*2 + 1, 1);
				_projector.unprojectVector(vector, _persCamera);
				_raycaster.set(_persCamera.position, vector.sub(_persCamera.position).normalize());

				var intersects = _raycaster.intersectObjects(_this.children);

				if (intersects.length > 0) {
					var obj = intersects[0].object;
					if (obj.material && obj.material.visible && obj.visible && obj.onclick) {
						obj.onclick();

						return true;
					}
				}
			}

			return false;
		};

		return _this;
	};

	this.setCameraMode = function(mode) {
		if (_cameraMode === mode) {
			return;
		}

		if (mode === PS.Packet.CameraMode.Global) {
			_renderer.setClearColor(0xffffff, 1);
			_controls.setEnabled(true);

			//change camera trackball pose to match the current one
			_controls.resetFromPose(_persCamera.position, _persCamera.quaternion, _persCamera.distanceToObject);
		}
		else {
			_renderer.setClearColor(0x000000, 0);
			_controls.setEnabled(false);
		}

		_controls.setEnabled(mode === PS.Packet.CameraMode.Global);
		_cameraMode = mode;
	};

	this.getCroppingInformations = function() {
		return _scissor;
	};

	this.setCroppingInformations = function(scissor) {
		_scissor = scissor;
		_needsToRender = true;
	};

	this.setCroppingEnabled = function(enabled) {
		if (_options.croppingEnabled !== enabled) {
			_options.croppingEnabled = enabled;
			_needsToRender = true;
		}
	};

	this.setHoleFillingEnabled = function(enabled) {
		if (_options.holeFillingEnabled !== enabled) {
			_options.holeFillingEnabled = enabled;
			_needsToRender = true;
		}
	};

	this.forceUpdateIfVisible = function(camera, index) {
		if (_scenes[0].currentImageIndex === index) {
			_scenes[0].setCurrentImage(index, camera.mesh);
			_needsToRender = true;
		}
		else if (_scenes[1].currentImageIndex === index) {
			_scenes[1].setCurrentImage(index, camera.mesh);
			_needsToRender = true;
		}
	};

	this.forceUpdateScenes = function(cameras) {
		var imgIndexInScene0 = _scenes[0].currentImageIndex;
		var imgIndexInScene1 = _scenes[1].currentImageIndex;
		_scenes[0].setCurrentImage(imgIndexInScene0, cameras[imgIndexInScene0].mesh);
		_scenes[1].setCurrentImage(imgIndexInScene1, cameras[imgIndexInScene1].mesh);
		_needsToRender = true;
	};

	this.forceRenderFrame = function() {
		_needsToRender = true;
	};

	var _needBlendingFlipping = false;

	this.updateScenes = function(cameras, minIndex, maxIndex, percent, fov) {

		//Goal of this function: re-use texture already uploaded
		// x       = virtual camera position
		// a,b,c,d = indices of camera on the path
		// [X,Y]   = [scenes[0].currentImageIndex, scenes[1].currentImageIndex]

		//Example:

		// a -x- b --- c --- d -> [a,b] //init
		// a --- b -x- c --- d -> [c,b] //re-use b
		// a --- b --- c -x- d -> [c,d] //re-use c
		// a --- b -x- c --- d -> [c,b] //re-use c

		var imgIndexInScene0 = _scenes[0].currentImageIndex;
		var imgIndexInScene1 = _scenes[1].currentImageIndex;

		var minCamera = cameras[minIndex];
		var maxCamera = cameras[maxIndex];

		if (imgIndexInScene0 !== -1 && imgIndexInScene1 !== -1) {

			if ((imgIndexInScene0 !== minIndex || imgIndexInScene1 !== maxIndex) && (imgIndexInScene1 !== minIndex || imgIndexInScene0 !== maxIndex)) {
				if (imgIndexInScene0 === minIndex && imgIndexInScene1 !== maxIndex) {
					_scenes[1].setCurrentImage(maxIndex, maxCamera.mesh);
					_options.onCamerasChanged(minIndex, maxIndex); //normal
					_needBlendingFlipping = false;
					maxCamera.initializeScaleToCamera(minCamera);
					cameras[imgIndexInScene1].resetScale();
				}
				else if (imgIndexInScene0 === maxIndex && imgIndexInScene1 !== minIndex) {
					_scenes[1].setCurrentImage(minIndex, minCamera.mesh);
					_options.onCamerasChanged(minIndex, maxIndex); //opposite
					_needBlendingFlipping = true;
					minCamera.initializeScaleToCamera(maxCamera);
					cameras[imgIndexInScene1].resetScale();
				}
				else if (imgIndexInScene1 === minIndex && imgIndexInScene0 !== maxIndex) {
					_scenes[0].setCurrentImage(maxIndex, maxCamera.mesh);
					_options.onCamerasChanged(minIndex, maxIndex); //opposite
					_needBlendingFlipping = true;
					maxCamera.initializeScaleToCamera(minCamera);
					cameras[imgIndexInScene0].resetScale();
				}
				else if (imgIndexInScene1 === maxIndex && imgIndexInScene0 !== minIndex) {
					_scenes[0].setCurrentImage(minIndex, minCamera.mesh);
					_options.onCamerasChanged(minIndex, maxIndex); //normal
					_needBlendingFlipping = false;
					minCamera.initializeScaleToCamera(maxCamera);
					cameras[imgIndexInScene0].resetScale();
				}
				else if (imgIndexInScene0 !== minIndex && imgIndexInScene1 !== maxIndex) {
					_scenes[0].setCurrentImage(minIndex, minCamera.mesh);
					_scenes[1].setCurrentImage(maxIndex, maxCamera.mesh);
					_options.onCamerasChanged(minIndex, maxIndex); //normal
					_needBlendingFlipping = false;
					if (percent < 0.5) {
						minCamera.initializeScaleToCamera(cameras[imgIndexInScene0]);
						maxCamera.initializeScaleToCamera(minCamera);
					}
					else {
						maxCamera.initializeScaleToCamera(cameras[imgIndexInScene0]);
						minCamera.initializeScaleToCamera(maxCamera);
					}
					cameras[imgIndexInScene0].resetScale();
					cameras[imgIndexInScene1].resetScale();
				}
			}
		}
		else { //init case
			_scenes[0].setCurrentImage(minIndex, minCamera.mesh);
			_scenes[1].setCurrentImage(maxIndex, maxCamera.mesh);
			_options.onCamerasChanged(minIndex, maxIndex); //normal
			_needBlendingFlipping = false;
			if (percent < 0.5) {
				maxCamera.initializeScaleToCamera(minCamera);
			}
			else {
				minCamera.initializeScaleToCamera(maxCamera);
			}
		}

		if (fov !== _persCamera.fov && _cameraMode !== PS.Packet.CameraMode.Global) {
			_persCamera.projectionMatrix.makePerspective(fov, _width / _height, _options.near, _options.far);
			_persCamera.fov = fov;
		}

		var percentBeforeClamping = percent;
		percent = Math.max(0, Math.min(1, percent)); //clamping to [0, 1] for safety
		if (percent !== percentBeforeClamping && !_wasBlendingOutOfRange) {
			_wasBlendingOutOfRange = true;
			_options.onLog({type:"Error", message: "Out of range blending ("+percentBeforeClamping+")", context: {
				minIndex: minIndex,
				maxIndex: maxIndex,
				percent: percent
			}});
		}

		minCamera.setPercentToNext(percent);
		maxCamera.setPercentToPrevious(1.0-percent);

		var rPercent = _needBlendingFlipping ? percent : 1.0 - percent; //rendering percent for shader
		if (_options.blendingFunction === PS.Packet.BlendingFunction.Step) {
			rPercent = Math.round(rPercent);
		}
		else if (_options.blendingFunction === PS.Packet.BlendingFunction.Sigmoid) {
			var sigma = _options.blendingSigma;
			var d     = rPercent;
			var p0    = Math.exp(-d*d/(sigma*sigma));
			var p1    = Math.exp(-(1-d)*(1-d)/(sigma*sigma));
			rPercent  = p1/(p0+p1);
		}
		//there is nothing to do in the PS.Packet.BlendingFunction.Linear case

		rPercent = Math.max(0, Math.min(1, rPercent)); //clamping to [0, 1] for safety

		_blendFactor.value = rPercent;
		_needsToRender = true;
	};

	this.getCamera = function() {
		return _persCamera;
	};

	function computePyramidDimension(width, height) {
		var pyrDimensions = [];
		var w = width;
		var h = height;
		var idx = -1;

		while (true) {
			w = Math.ceil((w+1)/2);
			h = Math.ceil((h+1)/2);
			idx++;

			if (w < 3 || h < 3) {
				break;
			}
			pyrDimensions.push(new THREE.Vector2(w, h));
		}
		_pyrLevels = idx+1;
		_pyrDimensions = pyrDimensions;
	}

	function createPyramid() {

		var pyrLength = _pyrDimensions.length;

		var pyr = new Array(pyrLength);
		for (var i=0; i<pyrLength; ++i) {
			var dim = _pyrDimensions[i];
			pyr[i] = new THREE.WebGLRenderTarget(dim.x, dim.y, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
			PS.Packet.WebGLMU.addTexture(dim.x*dim.y*4);
		}
		return pyr;
	}

	this.startRenderLoop = function() {
		animate();
	};

	this.stopRenderLoop = function() {
		//TODO: render a black screen?
		if (_requestAnimFrameId) {
			cancelAnimationFrame(_requestAnimFrameId);
			_requestAnimFrameId = null;
		}
	};

	this.isRenderLoopRunning = function() {
		return _requestAnimFrameId ? true : false;
	};

	this.getSize = function() {
		return _renderSize;
	};

	this.destroy = function(w, h) {

		_that.stopRenderLoop();

		//dispose of textures used for hole filling
		disposeTextures(w, h);

		//clear scene from the current mesh
		_scenes[0].clear();
		_scenes[1].clear();

		_scene.remove(_quad);
		_quad = null;

		//dispose of materials used by the viewer (mainly used for hole-filling)
		_downsamplingMaterial.dispose();
		_upsamplingMaterial.dispose();
		_blendingMaterial.dispose();
		_commonMaterial.dispose();

		if (_randomTexture) {
			_randomTexture.dispose();
		}
		_controls.destroy();
	};

	function disposeTextures(w, h) {
		_rtTexture0.dispose();
		_rtTexture1.dispose();

		PS.Packet.WebGLMU.addTexture(-w*h*4);
		PS.Packet.WebGLMU.addTexture(-w*h*4);

		_rtTextureFilled.dispose();

		PS.Packet.WebGLMU.addTexture(-w*h*4);

		for (var i=0; i<_pyrDown.length; ++i) {
			var pyrLevel = _pyrDown[i];
			PS.Packet.WebGLMU.addTexture(-pyrLevel.width*pyrLevel.height*4);
			pyrLevel.dispose();
		}
		for (var i=0; i<_pyrUp.length; ++i) {
			var pyrLevel = _pyrUp[i];
			PS.Packet.WebGLMU.addTexture(-pyrLevel.width*pyrLevel.height*4);
			pyrLevel.dispose();
		}
	}

	this.resize = function(w, h) {

		var previousW = _width;
		var previousH = _height;

		_renderSize.set(w, h);

		_width  = w;
		_height = h;
		_scissor = {
			x: 0,
			y: 0,
			w: Math.floor(_width),
			h: Math.floor(_height)
		};

		// camera for 2D quad blending
		_orthoCamera = new THREE.OrthographicCamera(_width /  2, _width / -2, _height / -2, _height /  2, -10000, 10000);
		_orthoCamera.position.z = 100;

		//camera for 3D scene rendering
		_persCamera.aspect = _width / _height;
		_persCamera.updateProjectionMatrix();

		//dispose previous textures
		disposeTextures(previousW, previousH);

		//allocates new textures
		_rtTexture0 = new THREE.WebGLRenderTarget(_width, _height, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat});
		_rtTexture1 = new THREE.WebGLRenderTarget(_width, _height, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat});
		PS.Packet.WebGLMU.addTexture(_width*_height*4);
		PS.Packet.WebGLMU.addTexture(_width*_height*4);

		_rtTextureFilled = new THREE.WebGLRenderTarget(_width, _height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat});
		PS.Packet.WebGLMU.addTexture(_width*_height*4);
		computePyramidDimension(_width, _height);
		_pyrDown = createPyramid();
		_pyrUp   = createPyramid();

		//remove old quad
		_scene.remove(_quad);

		//quad for fullscreen blending
		var plane = new THREE.PlaneGeometry(_width, _height);
		var quad = new THREE.Mesh(plane, _blendingMaterial);
		quad.position.z = -100;
		quad.rotation.z = Math.PI;
		_scene.add(quad);
		_quad = quad;

		_renderer.setSize(_width, _height);

		//update materials
		_blendingMaterial.uniforms.tDiffuse1.value = _rtTexture0;
		_blendingMaterial.uniforms.tDiffuse2.value = _rtTexture1;
		_commonMaterial.uniforms.tDiffuse.value    = _rtTexture0;

		if (_options.blendingMode === PS.Packet.BlendingMode.DitheringLuminance ||
			_options.blendingMode === PS.Packet.BlendingMode.DitheringColor) {
			_blendingMaterial.uniforms.texSize.value.set(_width, _height);
		}

		_controls.handleResize();

		_that.forceRenderFrame();
	};

	function init(div, inputDiv) {

		// scene
		_scene = new THREE.Scene();
		_scenes.push(new PS.Packet.OffscreenScene(new THREE.Scene()));
		_scenes.push(new PS.Packet.OffscreenScene(new THREE.Scene()));

		// camera for 2D quad blending
		_orthoCamera = new THREE.OrthographicCamera(_width /  2, _width / -2, _height / -2, _height /  2, -10000, 10000);
		_orthoCamera.position.z = 100;
		_scene.add(_orthoCamera);

		//camera for 3D scene rendering
		_persCamera = new THREE.PerspectiveCamera(_options.fov, _width / _height, _options.near, _options.far);
		_persCamera.fov = _options.fov;
		_scenes[0].scene.add(_persCamera);

		_rtTexture0 = new THREE.WebGLRenderTarget(_width, _height, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat});
		_rtTexture1 = new THREE.WebGLRenderTarget(_width, _height, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat});
		PS.Packet.WebGLMU.addTexture(_width*_height*4);
		PS.Packet.WebGLMU.addTexture(_width*_height*4);

		if (_options.blendingMode === PS.Packet.BlendingMode.DitheringLuminance ||
			_options.blendingMode === PS.Packet.BlendingMode.DitheringColor) {
			var textureWidth = 128; //MUST be a power of 2!
			var length = textureWidth*textureWidth*3;
			var randomData = new Uint8Array(length);
			var bufferIndex = 0;
			var nbValues = length/3;
			for (var i=0; i<nbValues; ++i) {
				randomData[bufferIndex++] = Math.floor(Math.random()*255);
				randomData[bufferIndex++] = Math.floor(Math.random()*255);
				randomData[bufferIndex++] = Math.floor(Math.random()*255);
			}
			_randomTexture = new THREE.DataTexture(randomData, textureWidth, textureWidth, THREE.RGBFormat, THREE.UnsignedByteType, new THREE.UVMapping(), THREE.RepeatWrapping, THREE.RepeatWrapping);
			_randomTexture.needsUpdate = true;
			PS.Packet.WebGLMU.addTexture(length);
		}

		//if (_options.holeFillingEnabled) { //created in all cases to allow enabling/disabling from the 42 menu without reloading
			_rtTextureFilled = new THREE.WebGLRenderTarget(_width, _height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat});
			PS.Packet.WebGLMU.addTexture(_width*_height*4);
			computePyramidDimension(_width, _height);
			_pyrDown = createPyramid();
			_pyrUp   = createPyramid();

			_downsamplingMaterial = new THREE.ShaderMaterial({
				uniforms: {
					uReduceTex: { type: "t", value: null },
					uReduceDx:  { type: "f", value: 0 },
					uReduceDy:  { type: "f", value: 0 }
				},
				vertexShader: PS.Packet.Shaders.commonMaterial.vertexShader,
				fragmentShader: PS.Packet.Shaders.downsamplingMaterial.fragmentShader,
				depthWrite: false
			});

			_upsamplingMaterial = new THREE.ShaderMaterial({
				uniforms: {
					uExpandTex0: { type: "t", value: null },
					uExpandTex1: { type: "t", value: null }
				},
				vertexShader: PS.Packet.Shaders.commonMaterial.vertexShader,
				fragmentShader: PS.Packet.Shaders.upsamplingMaterial.fragmentShader,
				depthWrite: false
			});
		//}

		//create material for fullscreen blending between _scenes[0] and _scenes[1]
		var blendingShaders = PS.Packet.Shaders.Factory.generateBlendingShaders({blendingMode: _options.blendingMode});
		var blendingUniforms = THREE.UniformsUtils.clone(blendingShaders.uniforms);
		blendingUniforms.tDiffuse1.value = _rtTexture0;
		blendingUniforms.tDiffuse2.value = _rtTexture1;
		blendingUniforms.blendFactor.value = 0.5;
		if (_options.blendingMode === PS.Packet.BlendingMode.DitheringLuminance ||
			_options.blendingMode === PS.Packet.BlendingMode.DitheringColor) {
			blendingUniforms.tRandom.value = _randomTexture;
			blendingUniforms.texSize.value = new THREE.Vector2(_width, _height);
		}
		_blendingMaterial = new THREE.ShaderMaterial({
			uniforms: blendingUniforms,
			vertexShader: blendingShaders.vertexShader,
			fragmentShader: blendingShaders.fragmentShader,
			depthWrite: false
		});
		_blendFactor = _blendingMaterial.uniforms.blendFactor;

		_commonMaterial =  new THREE.ShaderMaterial({
			uniforms: {
				tDiffuse: { type: "t", value: _rtTexture0 }
			},
			vertexShader: PS.Packet.Shaders.commonMaterial.vertexShader,
			fragmentShader: PS.Packet.Shaders.commonMaterial.fragmentShader,
			depthWrite: false
		});

		//quad for fullscreen blending
		var plane = new THREE.PlaneGeometry( _width, _height );
		var quad = new THREE.Mesh( plane, _blendingMaterial );
		quad.position.z = -100;
		quad.rotation.z = Math.PI;
		_scene.add(quad);
		_quad = quad;

		// renderer
		_renderer = new THREE.WebGLRenderer({
			antialias: true,
			preserveDrawingBuffer: _options.screenshotEnabled,
			devicePixelRatio: 1 //three.js is multiplying the canvas size by this factor (which is affected while applying browser zoom factor on IE11 and firefox but not on chrome)
		});
		_renderer.setClearColor(0x000000, 0);
		_renderer.setSize(_width, _height);

		_renderer.autoClear = false; //needed for annotations

		_container = div;
		_container.appendChild(_renderer.domElement);

		_controls = new THREE.TrackballControls( _persCamera, inputDiv);
		_controls.setEnabled(_options.startCameraMode === PS.Packet.CameraMode.Global);
		_controls.onCameraMove = function() {
			_viewer.resetAnimateTimer();
			_needsToRender = true;
		};
		_that.setCameraMode(_options.startCameraMode);

		_controls.rotateSpeed = 1.0;
		_controls.zoomSpeed = 1.2;
		_controls.panSpeed = 0.8;

		_controls.noZoom = false;
		_controls.noPan = false;

		_controls.staticMoving = false;
		_controls.dynamicDampingFactor = 0.2;

		_controls.keys = [ 65, 83, 68 ];
	}

	this.simulateMouseWheel = function(delta) {
		_controls.simulateMouseWheel(delta);
	};

	//hole filling
	function fillTexture(source, target) {

		//downsampling
		_quad.material = _downsamplingMaterial;
		for (var level=0; level<_pyrLevels-1; level++) {

			var dim = _pyrDimensions[level-1];
			var uw = (level === 0 ? _width  : dim.x);
			var uh = (level === 0 ? _height : dim.y);

			var uniforms = _downsamplingMaterial.uniforms;
			uniforms.uReduceTex.value = (level === 0 ? source : _pyrDown[level-1]);
			uniforms.uReduceDx.value  = 1.0/uw;
			uniforms.uReduceDy.value  = 1.0/uh;

			_renderer.render(_scene, _orthoCamera, _pyrDown[level], true);
		}

		//upsampling
		_quad.material = _upsamplingMaterial;
		for (var level = _pyrLevels-2; level >= 0; level--) {

			var uniforms = _upsamplingMaterial.uniforms;
			uniforms.uExpandTex1.value = (level === 0 ? source : _pyrDown[level-1]);
			uniforms.uExpandTex0.value = (level === _pyrLevels-2 ? _pyrDown[level] : _pyrUp[level]);

			_renderer.render(_scene, _orthoCamera, (level === 0 ? target : _pyrUp[level-1]), true);
		}
	}

	function render() {

		if (_cameraMode === PS.Packet.CameraMode.Global) {
			_renderer.clear();
			_renderer.render(_scenes[_globalViewCamera].scene, _persCamera);
		}
		else { //local view mode
			_renderer.clear();
			_renderer.render(_scenes[0].scene, _persCamera, _rtTexture0, true);
			_renderer.render(_scenes[1].scene, _persCamera, _rtTexture1, true);

			if (!_options.holeFillingEnabled) {
				_quad.material = _blendingMaterial;
				if (_options.croppingEnabled) {
					_renderer.enableScissorTest(true);
					_renderer.setScissor(_scissor.x, _scissor.y, _scissor.w, _scissor.h);
				}
				_renderer.render(_scene, _orthoCamera);
				if (_options.croppingEnabled) {
					_renderer.enableScissorTest(false);
				}
			}
			else {
				_quad.material = _blendingMaterial;
				_renderer.render(_scene, _orthoCamera, _rtTextureFilled, true);
				fillTexture(_rtTextureFilled, _rtTexture0); //memory optimization: re-using rtTexture0 for output
				_quad.material = _commonMaterial;
				if (_options.croppingEnabled) {
					_renderer.enableScissorTest(true);
					_renderer.setScissor(_scissor.x, _scissor.y, _scissor.w, _scissor.h);
				}
				_renderer.render(_scene, _orthoCamera);
				if (_options.croppingEnabled) {
					_renderer.enableScissorTest(false);
				}
			}
		}

		//render annotations
		if (!_that.overlayScene.isEmpty()) {
			_renderer.render(_that.overlayScene, _persCamera);
		}

	}

	function animate() {
		if (_controls.isEnabled()) {
			_controls.update();
		}
		_requestAnimFrameId = requestAnimationFrame(animate);
		if (_needsToRender) {
			render();
		}
		if (_options.lazyRenderingEnabled) {
			_needsToRender = false;
		}
		_options.onUpdate();
	}

	init(div, inputDiv);
};
