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

	MapViewer :
	-----------

	This is the class responsible for drawing the mini-map visible when you press 'm'.

	Methods:
	- init(viewer, dataset)
		- viewer = PS.PacketViewer
	- resize(width, height, mode)
		- mode = PS.Packet.ResizeMode
	- update(pose)
		- pose = {position, orientation} object
	- isVisible()
	- setVisible(enable)
		- enable = boolean

*/

//This a bad hack to have 2D rotations on Vector3
THREE.Vector3.prototype.rotate = function(origin, angle) {

	var sinAngle = Math.sin(angle);
	var cosAngle = Math.cos(angle);

	this.x -= origin.x;
	this.y -= origin.y;

	var x = this.x * cosAngle - this.y * sinAngle;
	var y = this.x * sinAngle + this.y * cosAngle;

	this.x = origin.x + x;
	this.y = origin.y + y;
};

PS.Packet.Map = {};

PS.Packet.Map.Viewer = function(div, options) {

	var _that = this;
	var _mapDiv = div;
	var _playerWidth;
	var _playerHeight;
	var _width;
	var _height;
	var _canvas;
	var _ctx;

	var _viewer;
	var _dataset;

	var _currentCanvas;
	var _currentCtx;

	var _options = {
		isVisible: false, //is the map visible at startup
		halfAngle: 30,    //half angle in degree of the camera frustum
		backgroundColor:  "rgba(0, 0 , 0, 0.5)",
		pathColor:        "rgba(255, 255, 255, 0.3)",
		currentPoseColor: "red",
		posesColor:       "green"
	};
	PS.extend(_options, options);

	var _halfAngle = _options.halfAngle * Math.PI / 180.0;
	var _radius = 20;
	var _isVisible = _options.isVisible;

	var _datasetProperties = {
		origin: new THREE.Vector2(),
		offset: new THREE.Vector2(),
		dominantAngle: 0,
		scaling: 0
	};

	function buildDOM() {
		_canvas = document.createElement("canvas");
		_canvas.style.position = "absolute";
		_canvas.style.top   = "0px";
		_canvas.style.right = "0px";
		_canvas.style.display = "block";
		_ctx = _canvas.getContext("2d");

		_currentCanvas = document.createElement("canvas");
		_currentCanvas.style.position = "absolute";
		_currentCanvas.style.top   = "0px";
		_currentCanvas.style.right = "0px";
		_currentCanvas.style.display = "block";
		_currentCtx = _currentCanvas.getContext("2d");

		_mapDiv.appendChild(_canvas);
		_mapDiv.appendChild(_currentCanvas);
		_mapDiv.style.zIndex = 2;

		var origin = "top right";
		_mapDiv.style.transformOrigin       = origin;
		_mapDiv.style.msTransformOrigin     = origin;
		_mapDiv.style.webkitTransformOrigin = origin;
		_mapDiv.style.mozTransformOrigin    = origin;

		_that.setVisible(_isVisible);
	}

	function changeCoord(pos) {
		pos.rotate(_datasetProperties.origin, _datasetProperties.angle);
		pos.x = pos.x*_datasetProperties.scaling + _datasetProperties.offset.x;
		pos.y = _height - (pos.y*_datasetProperties.scaling + _datasetProperties.offset.y);

		return pos;
	}

	function computeDatasetMapProperties(viewer, dataset) {

		var cameras = dataset.cameras;
		var path    = dataset.path;

		_playerWidth  = viewer.resizeState.containerWidth;
		_playerHeight = viewer.resizeState.containerHeight;
		_width  = _playerWidth  / 3;
		_height = _playerHeight / 3;

		//Determining the global orientation of the path by using PCA

		var mean = new THREE.Vector2();
		for (var i=0; i<path.points.length; ++i) {
			var pos = path.points[i].position;
			mean.x += pos.x;
			mean.y += pos.y;
		}
		mean.x /= path.points.length;
		mean.y /= path.points.length;
		_datasetProperties.origin.set(mean.x, mean.y);

		var covarianceMatrix = { //There is no THREE.Matrix2 class :(
			a: 0,  b: 0,
			c: 0,  d: 0
		};

		for (var i=0; i<path.points.length; ++i) {
			var pos = path.points[i].position;
			var x = pos.x - mean.x;
			var y = pos.y - mean.y;
			covarianceMatrix.a += x*x; covarianceMatrix.b += x*y;
			covarianceMatrix.c += y*x; covarianceMatrix.d += y*y;
		}

		//Eigenvector extraction from http://www.math.harvard.edu/archive/21b_fall_04/exhibits/2dmatrices/index.html
		var T = covarianceMatrix.a + covarianceMatrix.d;
		var D = covarianceMatrix.a*covarianceMatrix.d - covarianceMatrix.b*covarianceMatrix.c;
		var L1 = T/2 + Math.sqrt(T*T/4-D);

		var angle = (Math.abs(covarianceMatrix.b) > 1e-6) ? -Math.atan2(covarianceMatrix.c, L1-covarianceMatrix.d) + Math.PI/2 : 0;
		_datasetProperties.angle = angle;

		//compute bounding box of cameras and points in the path
		var xmin = Number.POSITIVE_INFINITY;
		var xmax = Number.NEGATIVE_INFINITY;
		var ymin = Number.POSITIVE_INFINITY;
		var ymax = Number.NEGATIVE_INFINITY;

		//using cameras to compute the bbox
		for (var i=0; i<cameras.length; ++i) {
			var pos = cameras[i].pose.position.clone();
			pos.rotate(mean, angle);
			xmin = Math.min(xmin, pos.x);
			xmax = Math.max(xmax, pos.x);
			ymin = Math.min(ymin, pos.y);
			ymax = Math.max(ymax, pos.y);
		}

		//using points in the path to compute the bbox
		for (var i=0; i<path.points.length; ++i) {
			var pos = path.points[i].position.clone();
			pos.rotate(mean, angle);
			xmin = Math.min(xmin, pos.x);
			xmax = Math.max(xmax, pos.x);
			ymin = Math.min(ymin, pos.y);
			ymax = Math.max(ymax, pos.y);
		}

		var xdelta = Math.abs(xmax-xmin);
		var ydelta = Math.abs(ymax-ymin);
		var xratio = _width/xdelta;
		var yratio = _height/ydelta;

		_datasetProperties.scaling = Math.min(xratio, yratio)*0.8;
		var widthWithPadding  = Math.max(xdelta*_datasetProperties.scaling/0.8, 90); //adding a 90px limit so that we can see the red arrow even for straight line datasets

		//	If the rotated map width is less than the space available in the viewer letterbox,
		//	scale up the map so that it can use all horizontal or vertical space.

		var letterboxWidth = (_playerWidth - viewer.getCropping(viewer.dataset.medianCamera).w) / 2;
		if (widthWithPadding < letterboxWidth) {
			var heightWithPadding = ydelta*_datasetProperties.scaling/0.8;
			var scaleX = letterboxWidth / widthWithPadding;  //horizontal constraint (letterbox width)
			var scaleY = _playerHeight  / heightWithPadding; //vertical constraint (viewer height)
			var fittingScaling = Math.min(scaleX, scaleY);
			_datasetProperties.scaling *= fittingScaling;
			widthWithPadding  *= fittingScaling;
			heightWithPadding *= fittingScaling;
			_height = Math.round(heightWithPadding);
		}

		_width = Math.round(widthWithPadding);

		var xOffset = (widthWithPadding - xdelta*_datasetProperties.scaling) / 2;
		_datasetProperties.offset.set(xOffset + - xmin*_datasetProperties.scaling, (_height-ydelta*_datasetProperties.scaling)/2 - ymin*_datasetProperties.scaling);

	}

	this.init = function(viewer, dataset) {
		_isVisible = _options.isVisible;
		reset(viewer, dataset);
	};

	function reset(viewer, dataset) {
		_viewer  = viewer;
		_dataset = dataset;

		computeDatasetMapProperties(viewer, dataset);

		_canvas.width         = _width;
		_currentCanvas.width  = _width;

		_canvas.height        = _height;
		_currentCanvas.height = _height;

		_ctx.clearRect(0, 0, _width, _height);
		_currentCtx.clearRect(0, 0, _width, _height);

		//background color
		_ctx.fillStyle = _options.backgroundColor;
		_ctx.fillRect(0, 0, _width, _height);

		//drawing cameras center
		_ctx.save();
		_ctx.strokeStyle = _options.posesColor;
		_ctx.beginPath();
		for (var i=0; i<dataset.cameras.length; ++i) {
			var pos = dataset.cameras[i].pose.position.clone();
			changeCoord(pos);
			_ctx.moveTo(pos.x, pos.y);
			_ctx.arc(pos.x, pos.y, 1.0, 0, 2*Math.PI);
		}
		_ctx.stroke();
		_ctx.restore();

		//drawing smooth path
		_ctx.save();
		_ctx.strokeStyle = _options.pathColor;
		_ctx.beginPath();
		var pos = dataset.path.points[0].position.clone();
		changeCoord(pos);
		_ctx.moveTo(pos.x, pos.y);
		for (var i=1; i<dataset.path.points.length; ++i) {
			var pos = dataset.path.points[i].position.clone();
			changeCoord(pos);
			_ctx.lineTo(pos.x, pos.y);
		}
		if (dataset.path.isClosed) {
			var pos = dataset.path.points[0].position.clone();
			changeCoord(pos);
			_ctx.lineTo(pos.x, pos.y);
		}
		_ctx.stroke();
		_ctx.restore();

		_that.setVisible(_isVisible);

		_that.update(viewer.getCurrentPose());
	}

	this.resize = function(width, height, mode) {

		var scale = Math.min(width / _playerWidth, height / _playerHeight);

		if (mode === PS.Packet.ResizeMode.Slow) {
			reset(_viewer, _dataset);
			scale = 1;
		}

		var transform = "scale(" + scale.toFixed(8) + ")";

		_mapDiv.style.transform       = transform;
		_mapDiv.style.msTransform     = transform;
		_mapDiv.style.webkitTransform = transform;
		_mapDiv.style.mozTransform    = transform;
		_mapDiv.style.width  = width  + "px";
		_mapDiv.style.height = height + "px";
	};

	this.update = function(pose) {
		//erase previous camera position
		_currentCtx.clearRect(0, 0, _width, _height);

		//display new camera position
		_currentCtx.save();
		_currentCtx.strokeStyle = _options.currentPoseColor;
		_currentCtx.beginPath();
		var pos = changeCoord(pose.position.clone());
		var x = pos.x;
		var y = pos.y;
		_currentCtx.moveTo(x, y);
		_currentCtx.arc(x, y, 2.0, 0, 2*Math.PI);

		var opticalAxis = new THREE.Vector3(0, 0, -1);
		opticalAxis.applyQuaternion(pose.orientation);
		var angle = Math.atan2(opticalAxis.y, opticalAxis.x) + _datasetProperties.angle;

		var maxRadius = _radius;
		var minRadius = _radius*0.6;

		//Arrow
		_currentCtx.moveTo(x, y);
		_currentCtx.lineTo(x + Math.cos(angle)*maxRadius, y - Math.sin(angle)*maxRadius);
		_currentCtx.moveTo(x + Math.cos(angle-_halfAngle)*minRadius, y - Math.sin(angle-_halfAngle)*minRadius);
		_currentCtx.lineTo(x + Math.cos(angle)*maxRadius, y - Math.sin(angle)*maxRadius);
		_currentCtx.lineTo(x + Math.cos(angle+_halfAngle)*minRadius, y - Math.sin(angle+_halfAngle)*minRadius);

		/*
		//Fov
		_currentCtx.moveTo(x + Math.cos(angle-_halfAngle)*_radius, y - Math.sin(angle-_halfAngle)*_radius);
		_currentCtx.lineTo(x, y);
		_currentCtx.lineTo(x + Math.cos(angle+_halfAngle)*_radius, y - Math.sin(angle+_halfAngle)*_radius);
		*/

		_currentCtx.stroke();
		_currentCtx.restore();
	};

	this.isVisible = function() {
		return _isVisible;
	};

	this.setVisible = function(enable) {
		_mapDiv.style.display = !enable ? "none" : "";
		_isVisible = enable;
	};

	buildDOM();

};
