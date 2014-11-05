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

PS.Packet.Dataset = function(url) {

	//dataset main properties
	this.rootUrl = url;
	this.version = null;
	this.topology = null;
	this.dominantColors = null;

	//created objects
	this.cameras = [];
	this.path = null;
	this.atlases = [];
	this.thumbnails = [];
	this.particleSystems = [];

	this.frustrums = null;
	this.camerasAxes = [];
	this.smoothCameraPath = null;
	this.linearCameraPath = null;
	this.origin = null;

	//cameras properties
	this.averageQIndexDistBetweenCameras = null;
	this.averageWorldDistBetweenCameras = null;
	this.reverseCamIndex = null; //map from index to sIndex

	//dataset nbItems properties
	this.nbAtlases = null;
	this.nbAtlasesLoaded = 0;
	this.geometryRanges = null;
	this.nbGeometryLoaded = 0;
	this.nbPointCloudFiles = null;

	//rendering camera properties
	this.medianFov = null;
	this.medianAspectRatio = null;
	this.near = null;
	this.far = null;
	this.medianCamera = null;

	//rendering properties
	this.imageSize = new THREE.Vector2();
	this.thumbSize = new THREE.Vector2();
	this.renderingImageSize = new THREE.Vector2();
	this.nbLevels = null;
	this.lod = null;
	this.nbSurroundingImage = null;
	this.pointCloudMaterial = new THREE.ParticleBasicMaterial({
		size: 0.05,
		vertexColors : true
	});

	//animation properties
	this.animateSpeed = 1.0;
	this.startTransitionPercent = null;
	this.startingCamera = null;
	this.draggingDirection = new THREE.Vector2();
	this.draggingDirectionCSSClass = "";

	//download property
	this.startLoading = Date.now(); //unused
	this.preDownloadedImages = [];
	this.allGeometryWereDownloaded = false;
	this.allHDWereDownloadedOnce = false;
	this.priorityDownloader = null;
	this.isRenderable = false;
};

PS.Packet.Dataset.prototype.getCameraByIndex = function(idx) {
	var index = this.reverseCamIndex[idx];
	return this.cameras[index];
};

PS.Packet.Dataset.prototype.getImageUrl = function(index) {
	var paddedIndex = (index < 10) ? "000" + index : (index < 100) ? "00" + index : (index < 1000) ? "0" + index : index;
	return this.rootUrl + "l"+this.lod+"/img" + paddedIndex + ".jpg";
};

PS.Packet.Dataset.prototype.getSeadragonRootUrl = function(index) {
	var paddedIndex = (index < 10) ? "000" + index : (index < 100) ? "00" + index : (index < 1000) ? "0" + index : index;
	return this.rootUrl + "undistorted/img" + paddedIndex + "/";
};

PS.Packet.Dataset.prototype.getGeometryUrl = function(fileIndex) {
	return this.rootUrl + (this.version.json === 2 ? "geometry/" : "") + "geometry_" + fileIndex + ".bin";
};

PS.Packet.Dataset.prototype.getPointCloudUrl = function(fileIndex) {
	return this.rootUrl + (this.version.json === 2 ? "points/points_" + fileIndex + ".bin" : "ps1/points_0_" + fileIndex + ".bin");
};

PS.Packet.Dataset.prototype.getSurroundingCameras = function(currentPosition, limit) {
	var cams = this.cameras.slice(0); //making a copy
	var that = this;
	if (this.path.isClosed) {
		cams.sort(function(a,b) {
			var distA = Math.abs(a.qIndex-currentPosition)%that.path.nbPoints;
			if (distA > Math.round(that.path.nbPoints/2)) {
				distA = that.path.nbPoints-distA;
			}
			var distB = Math.abs(b.qIndex-currentPosition)%that.path.nbPoints;
			if (distB > Math.round(that.path.nbPoints/2)) {
				distB = that.path.nbPoints-distB;
			}
			return distA-distB;
		});
	}
	else {
		cams.sort(function(a,b) {
			return Math.abs(a.qIndex-currentPosition)-Math.abs(b.qIndex-currentPosition);
		});
	}
	if (limit) {
		cams = cams.filter(function(elt, index) { return index < limit; });
	}
	return cams.map(function(c) { return c.sIndex; });
};

PS.Packet.Dataset.prototype.createSubCamerasList = function(start, end) {
	var cameras = new Array(end-start);
	var offset = 0;
	for (var i=start; i<end; ++i) {
		cameras[offset++] = new PS.Packet.CameraForWorker(this.cameras[this.reverseCamIndex[i]]);
	}
	return cameras;
};

PS.Packet.Dataset.prototype.computeRange = function(rangeIndex) {
	var start = 0;
	var end = this.geometryRanges[0];
	for (var i=1; i<=rangeIndex; ++i) {
		start = end;
		end += this.geometryRanges[i];
	}

	//start inclusive, end exclusive [start, end[
	return {
		"start": start,
		"end": end
	};
};

PS.Packet.Dataset.prototype.createCamerasFrustums = function() {
	var geometry = new THREE.Geometry();
	var lineMaterial = new THREE.LineBasicMaterial({
		color: 0x000000,
		opacity: 1,
		linewidth: 3,
		vertexColors: false
	});

	var distanceFromCamera = this.averageWorldDistBetweenCameras/2;
	for (var i=0; i<this.cameras.length; ++i) {
		var cam = this.cameras[i];

		var planeHeight = 2 * distanceFromCamera * Math.tan(cam.fovy*0.5*Math.PI/180);
		var planeWidth  = planeHeight * cam.aspectRatio;

		var pos = cam.pose.position.clone();
		var rot = cam.pose.orientation.clone();
		/*
			C --- D
			|     |
			F --- E
		*/
		var c = new THREE.Vector3(-planeWidth/2,  planeHeight/2, -distanceFromCamera).applyQuaternion(rot).add(pos);
		var d = new THREE.Vector3( planeWidth/2,  planeHeight/2, -distanceFromCamera).applyQuaternion(rot).add(pos);
		var e = new THREE.Vector3( planeWidth/2, -planeHeight/2, -distanceFromCamera).applyQuaternion(rot).add(pos);
		var f = new THREE.Vector3(-planeWidth/2, -planeHeight/2, -distanceFromCamera).applyQuaternion(rot).add(pos);

		geometry.vertices.push(c);
		geometry.vertices.push(d);
		geometry.vertices.push(d);
		geometry.vertices.push(e);
		geometry.vertices.push(e);
		geometry.vertices.push(f);
		geometry.vertices.push(f);
		geometry.vertices.push(c);

		geometry.vertices.push(pos);
		geometry.vertices.push(c);
		geometry.vertices.push(pos);
		geometry.vertices.push(d);
		geometry.vertices.push(pos);
		geometry.vertices.push(e);
		geometry.vertices.push(pos);
		geometry.vertices.push(f);
	}
	var lines = new THREE.Line(geometry, lineMaterial, THREE.LinePieces);
	lines.visible = false;

	return lines;
};

PS.Packet.Dataset.prototype.createAxes = function(position) {
	var geometry = new THREE.Geometry();
	geometry.vertices.push(
		new THREE.Vector3(), new THREE.Vector3(1, 0, 0),
		new THREE.Vector3(), new THREE.Vector3(0, 1, 0),
		new THREE.Vector3(), new THREE.Vector3(0, 0, 1)
	);

	geometry.colors.push(
		new THREE.Color(0xff0000), new THREE.Color(0xff0000),
		new THREE.Color(0x00ff00), new THREE.Color(0x00ff00),
		new THREE.Color(0x0000ff), new THREE.Color(0x0000ff)
	);

	var axes = new THREE.Line(geometry, new THREE.LineBasicMaterial({vertexColors: THREE.VertexColors}), THREE.LinePieces);
	axes.position = position;
	axes.visible = false;

	return axes;
};

PS.Packet.Dataset.prototype.createCamerasAxes = function() {
	//TODO: create only one geometry will all axes
	var nbCameras = this.cameras.length;
	var camerasAxes = new Array(nbCameras);
	var scaleFactor = this.averageWorldDistBetweenCameras/2;
	for (var i=0; i<nbCameras; ++i) {
		var cam = this.cameras[i];
		var axes = this.createAxes(cam.pose.position);
		axes.quaternion = cam.pose.orientation;
		axes.scale.set(scaleFactor, scaleFactor, scaleFactor);
		camerasAxes[i] = axes;
	}
	return camerasAxes;
};

PS.Packet.Dataset.prototype.createSmoothCameraPath = function() {
	var geometry = new THREE.Geometry();
	var lineMaterial = new THREE.LineBasicMaterial({
		color: 0xff00ff,
		opacity: 1,
		linewidth: 3,
		vertexColors: false
	});
	for (var i=0; i<this.path.points.length-1; ++i) {
		var pose = this.path.points[i];
		var nextPose = this.path.points[i+1];
		geometry.vertices.push(pose.position);
		geometry.vertices.push(nextPose.position);
	}

	var lines = new THREE.Line(geometry, lineMaterial, THREE.LinePieces);
	lines.visible = false;

	return lines;
};

PS.Packet.Dataset.prototype.createLinearCameraPath = function() {
	var geometry = new THREE.Geometry();
	var lineMaterial = new THREE.LineBasicMaterial({
		color: 0x000000,
		opacity: 1,
		linewidth: 3,
		vertexColors: false
	});
	for (var i=0; i<this.cameras.length-1; ++i) {
		var cam = this.cameras[i];
		var nextCam = this.cameras[i+1];
		geometry.vertices.push(cam.pose.position);
		geometry.vertices.push(nextCam.pose.position);
	}
	var lines = new THREE.Line(geometry, lineMaterial, THREE.LinePieces);
	lines.visible = false;

	return lines;
};

PS.Packet.Dataset.prototype.createGlobalViewGeometries = function() {

	this.frustums         = this.createCamerasFrustums();
	this.camerasAxes      = this.createCamerasAxes();
	this.smoothCameraPath = this.createSmoothCameraPath();
	this.linearCameraPath = this.createLinearCameraPath();
	this.origin           = this.createAxes(new THREE.Vector3(0,0,0));

	var scaleFactor = this.averageWorldDistBetweenCameras*2;
	this.origin.scale.set(scaleFactor, scaleFactor, scaleFactor);
};

PS.Packet.Dataset.prototype.updateSlidingWindow = function(viewerState) {

	var useDominantPlaneGeometry = !viewerState.geometryEnabled;

	var camIndexes = this.getSurroundingCameras(viewerState.currentQIndex, this.nbSurroundingImage);
	for (var i=0; i<this.cameras.length; ++i) {
		var camera = this.cameras[i];
		var wasSelected = camera.isSelected;
		var isSelected = camIndexes.indexOf(i) !== -1;
		camera.isSelected = isSelected;
		if (wasSelected && !isSelected) {
			camera.useAtlas(useDominantPlaneGeometry);
		}
		else if (isSelected && !wasSelected) {
			var willUseHD = camera.useHD(useDominantPlaneGeometry);
			if (!willUseHD && isSelected) {
				camera.isSelected = false;
			}
		}
	}
};


PS.Packet.Dataset.prototype.unload = function(renderer) {

	this.isRenderable = false;

	if (this.priorityDownloader) {
		this.priorityDownloader.destroy();
	}

	this.pointCloudMaterial.dispose();

	//Remove items from the Offscreen scenes

	var scenes = renderer.getScenes();

	//remove all global object
	var globalScene = scenes[0].scene;
	globalScene.remove(this.frustums);
	globalScene.remove(this.smoothCameraPath);
	globalScene.remove(this.linearCameraPath);
	globalScene.remove(this.origin);
	for (var i=0; i<this.camerasAxes.length; ++i) {
		globalScene.remove(this.camerasAxes[i]);
	}
	for (var i=0; i<this.particleSystems.length; ++i) {
		globalScene.remove(this.particleSystems[i]);
	}
	for (var i=0; i<scenes.length; ++i) {
		scenes[i].clear(); //remove current mesh geometry
	}

	//Dispose GPU memory used by items

	this.frustums.geometry.dispose();
	this.smoothCameraPath.geometry.dispose();
	this.linearCameraPath.geometry.dispose();
	this.origin.geometry.dispose();

	for (var i=0; i<this.camerasAxes.length; ++i) {
		this.camerasAxes[i].geometry.dispose();
	}

	//unload camera materials and geometry
	for (var i=0; i<this.cameras.length; ++i) {
		this.cameras[i].dispose();
	}

	//unload atlases
	for (var i=0; i<this.atlases.length; ++i) {
		var atlas = this.atlases[i];
		PS.Packet.WebGLMU.addTexture(-atlas.image.width*atlas.image.height*3);
		atlas.dispose();
	}

	//unload point cloud
	for (var i=0; i<this.particleSystems.length; ++i) {
		var particleSystem = this.particleSystems[i];
		var nbVertices = particleSystem.geometry.attributes.position.numItems / 3;
		PS.Packet.WebGLMU.addBuffer(-nbVertices*3*4*2); //3=xyz or rgb, 4=float, 2=position + rgb
		particleSystem.geometry.dispose();
	}
};

PS.Packet.Dataset.prototype.getDominantColor = function() {
	var color = this.dominantColors[0];
	return new THREE.Color().setRGB(color[0]/255.0, color[1]/255.0, color[2]/255.0);
};
