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

PS.Packet.CameraMode = {
	Smooth: 0,
	Linear: 1,
	Global: 2
};

PS.Packet.Thumbnail = function(thumbnailIndex, atlasIndex, atlasWidth) {
	this.thumbnailIndex = thumbnailIndex;
	this.atlasIndex = atlasIndex;
	this.atlasWidth = atlasWidth;
	this.getUniform = function(thumbSize) {
		var x = 1 + this.thumbnailIndex*(thumbSize.x+2);
		var y = 1;
		var w = thumbSize.x;
		var h = thumbSize.y;
		return new THREE.Vector4(x/(this.atlasWidth-1), y/(thumbSize.y+1), w/(this.atlasWidth-1), h/(thumbSize.y+1));
	};
};

PS.Packet.Viewer = function(div, rootUrl, options) {

	var _options = { //default options

		onJsonParsed:            function() {}, //fired when the 0.json file as been parsed (dominant color is available + cameras informations)
		onCanvasCreated:         function() {}, //fired when the webgl canvas has been created (only once in the life time of the viewer even with multiple call .load())
		onCanvasUpdated:         function() {}, //fired when the webgl canvas has been updated (fired after every time to .load() and for the initial loading)
		onCameraModeChanged:     function() {}, //fired when the viewer camera mode is changing between smooth/linear/global
		onCamerasChanged:        function() {}, //fired when one of the surrounding cameras is different than before -> report both surrounding cameras
		onCameraChanged:         function() {}, //fired when the viewer is resting on a new camera
		onPositionChanged:       function() {}, //fired when the user is interacting and thus moving along the path
		onBeginDownloading:      function() {}, //fired when starting downloading a resource (image, path, geometry)
		onFinishDownloading:     function() {}, //fired when finishing downloading a resource (image, path, geometry)
		onGPUMemoryChanged:      function() {}, //fired when the amount of GPU memory changed (allocate/free texture/buffers) !!! before was called onGPUMemoryChange
		onStartAnimating:        function() {}, //fired when starting animating (you can start animating by using .togglePlay())
		onStopAnimating:         function() {}, //fired when stopping animating
		onAllGeometryLoaded:     function() {}, //fired when all geometry files are downloaded and parsed
		onAllGeometryDownloaded: function() {}, //fired when all geometry files are downloaded
		onAllHDLoaded:           function() {}, //fired when all HD images are downloaded once
		onLog:                   function() {}, //fired when the viewer wants to log something (performance, timing, error, ...)
		onTapped:                function() {}, //fired when the user taps on viewer
		onWebGLContextLost:      function() {}, //fired when the webgl context is lost
		onPoseChanged:           function() {}, //fired when the pose is changed during transition to go to rest pose (this callback is not public, only used internally to update the map)
		onProgressPercentChange: function() {}, //fired when the viewer need to update the progress percent displayed by metadata viewer (this callback is not public)
		onKeyDown:               function() {}, //fired when the viewer is receiving a keydown event (this callback is not public)
		onKeyUp:                 function() {}, //fired when the viewer is receiving a keyup event (this callback is not public)
		onIdle:                  function() {}, //fired when the user hasn't been interacting with the viewer (at least for idleDelay ms).
		onEndpointProgress:      function() {},
		onEndpointReached:       function() {}, //fired when dragging after the endpoing of a opened path.
		onCtrlClick:             function() {},
		onAnimFrameRequested:    function() {}, //fired when the requestAnimationFrame is called (it's not necessary for each frame rendered when lazyRendering is enabled)
		onContainerTransformed:  function() {},
		onResize:                function() {},
		onDatasetLoaded:         function() {},
		onDatasetRendered:       function() {},
		startDownloadingTiles:   function() {},
		onInputModeChange:       function() {},

		debugBlendingEnabled: false, //if enabled, display a random color on each 2D polygons
		autoStartEnabled:     true,  //if enabled, start automatically moving along the path when the geometry is loaded
		pointCloudEnabled:    false, //if enabled, will load and parse the point cloud + display it in global view
		virtualPathEnabled:   true,  //if enabled, will create a virtual path around the resting camera to have a smooth transition between the resting camera and the smooth path
		extendPathEnabled:    true,  //if enabled, will allow smooth path to be extended at the endpoint (by one average distance between camera)
		geometryEnabled:      true,  //if enabled, will use geometry otherwise will only use the dominant plane (useful for with/without geometry demo)
		smoothFovEnabled:     false,  //if enabled, will use a smooth fov computed for each points on the path instead of the medianFov
		smoothSpeedEnabled:   false, //if enabled, will use a local speed factor to slow down or accelerate animation (depending on camera density on the path)
		colorBalanceEnabled:  true,  //if enabled, will try to compensate for exposure differences
		pathFixingEnabled:    true,  //if enabled, will try to fix the path (single look at for spin or straight line for wall/walk for example) depending on the specified threshold
		progressBarEnabled:   false, //if enabled, will display a progress bar showing the progress of HD loading

		renderer: {
			holeFillingEnabled:   true,  //if enabled, will apply hole filling
			croppingEnabled:      true,  //if enabled, will apply cropping
			screenshotEnabled:    false, //if enabled, you can save the canvas as an Image (enabling might have bad performance impact on some machine)
			lazyRenderingEnabled: true,  //if enabled, the viewer is not rendering frame if the user is not moving along the path
			blendingFunction:     PS.Packet.BlendingFunction.Linear,
			blendingMode:         PS.Packet.BlendingMode.Opacity,
			blendingSigma:        0.5
		},

		downloadConcurrency: 8,     //download of geometry and HD are queued, this is the concurrency of the download queue
		startTransitionPercent: -1, //automatic: -1 (depends on topology= 0.5 for spin/pano and 0 for wall/walk), manual: [0,1] (0 = start of path, 1 = end of path)
		startCameraIndex: -1,       //if provided, will override startTransitionPercent
		startCameraMode: PS.Packet.CameraMode.Smooth,
		pathToWorker: "",           //path to the worker JS file (needed for IE11 and useful for debugging)
		width:  1280,               //width of the webgl canvas in pixel
		height: 720,                //height of the webgl canvas in pixel
		gpuHDMemoryBudget: 50,      //memory budget used for the sliding window of HD images in Mo
		maxHDPixels: 800 * 600,     //maximum number of pixels per HD image used in the webgl canvas (used to determine the pyramid lod)
		maxRenderSize: 1280 * 720,  //maximum number of pixels to render.  If the viewport is larger, then create a smaller canvas and scale up.
		singleLookAtThreshold: 6,   //threshold in degree to determine if the viewer should use a single look at for spin (low value = only perfect spin will trigger single LookAt mode)
		cameraRollThreshold: 15,    //threshold in degree to determine if the viewer should use a single up vector (removing camera roll)
		wallWalkRollThreshold: 10,  //threshold in degree to determine if viewer should use the mean roll for a wall/walk
		wallWalkPitchThreshold: 4,    //threshold in degree to determine if viewer should use the mean pitch for a wall/walk
		sharedOrientationThreshold: 8,    //threshold in degree to determine if the viewer should share all orientations (walls/walks only)
		colorBalanceSmoothingWeight: 0.8, //if colorBalanceEnabled, specifies how strongly to smooth the parameters over time. a value of 0 gives straight interpolation. a value of 1 gives global balancing

		idleDelay:        Number.POSITIVE_INFINITY, //if the user is not interacting after this delay in ms the viewer is automatically starting animating
		animateSpeed:     1,                        //while animating this is how much the camera is moving along the path (this amount is added each frame)
		animateDirection: 1.0,                      //could be 1 or -1
		timeForFullRotation: 15,                    //time spent in second to make a full 360 rotation while animating a spin or panorama
		wallWalkFramePerSecond: 2.0,                //wall and walk are displayed at this fixed framerate
		maxSpinFramePerSecond: 3.0,                 //spin are displayed at a fixed angular speed (360 = timeForFullRotation second) but if it exceed this framerate, the speed is reduced to this max framerate
		maxPanoFramePerSecond: 1.3                  //pano are displayed at a fixed angular speed (360 = timeForFullRotation second) but if it exceed this framerate, the speed is reduced to this max framerate
	};
	PS.extend(_options, options);	 //override default options

	var _div = div;

	var _animateSpeedFactor = 1;
	var _frameCounter = 0; //to measure fps while animating

	var _that = this;

	var _resizeState = {
		containerWidth:  0,
		containerHeight: 0,
		width:           0, //webgl canvas width  in pixel
		height:          0, //webgl canvas height in pixel
		scale:           0, //this.width * this.scale = stretched width of the webgl canvas (usually scale > 1)
		translateX:      0,
		translateY:      0
	};

	this.__defineGetter__("resizeState", function() {
		return PS.extend({}, _resizeState);
	});

	function setElemTransform(elem, translateX, translateY, scale) {
		//TODO: try using a 3d transform to allow subpixel translation
		var transform = "translate3d(" + translateX.toFixed(8) + "px, " + translateY.toFixed(8) + "px, 0) scale(" + scale.toFixed(8) + ")";

		elem.style.transform = transform;
		elem.style.msTransform = transform;
		elem.style.webkitTransform = transform;
		elem.style.mozTransform = transform;
	}

	this.setContainerTransform = function (translateX, translateY, scale) {
		_options.onContainerTransformed(translateX, translateY, scale);
		setElemTransform(_div, translateX, translateY, scale);
	};

	this.setOptions = function (options) {
		var geometryEnabled     = _options.geometryEnabled;
		var colorBalanceEnabled = _options.colorBalanceEnabled;

		var inputOptions = options || {};
		PS.extend(_options, inputOptions);

		if (geometryEnabled !== _options.geometryEnabled) { //detect if geometryEnabled option has change

			var useDominantPlaneGeometry = !_options.geometryEnabled;

			for (var i=0; i<_that.dataset.cameras.length; ++i) {
				var camera = _that.dataset.cameras[i];
				if (camera.isSelected) {
					camera.useHD(useDominantPlaneGeometry, true);
				}
				else {
					camera.useAtlas(useDominantPlaneGeometry, true);
				}
			}
		}

		if (colorBalanceEnabled !== _options.colorBalanceEnabled) {
			for (var i=0; i<_that.dataset.cameras.length; ++i) {
				_that.dataset.cameras[i].resetScale();
			}
		}
	};

	this.getOptions = function() { //returning a copy of the options
		var options = {};
		PS.extend(options, _options);

		return options;
	};

	this.getSeadragonOptions = function() {
		return {
			renderingSize: _that.dataset.renderingImageSize.clone()
		};
	};

	this.isCorsEnabled = function() {
		return _options.corsEnabled;
	};

	this.unload = function() {
		//stopping and unloading current dataset
		_that.stopPlaying();
		_that.stopSnappingToCamera();
		_that.renderer.stopRenderLoop();
		_that.dataset.unload(_that.renderer);
		_that.dataset = null;
		_that.renderer.overlayScene.clear();
	};

	this.destroy = function() {

		_that.unload();

		//TODO: set the active dataset of the datasetLoader to null?

		if (_that.datasetLoader) {
			//this will terminate the web worker
			_that.datasetLoader.destroy();
			_that.datasetLoader = null;
		}

		if (_that.renderer) {
			_that.renderer.destroy();
			_that.renderer = null;
		}

		if (_that.cameraController) {
			_that.cameraController.destroy();
			_that.cameraController = null;
		}

		if (_canvas) {
			_canvas.removeEventListener("webglcontextlost", onWebGLContextLost);
		}
	};

	//TODO: do not make this public?
	this.onBeginDownloading  = _options.onBeginDownloading;
	this.onFinishDownloading = _options.onFinishDownloading;
	this.onGPUMemoryChange   = _options.onGPUMemoryChanged;

	//auto-animation
	var _isAnimating = false;
	var _lastUserInteractionTime = new Date();
	var _startUserInteractionTime = new Date(_lastUserInteractionTime);

	//viewer state
	var _currentQIndex; //affected once we know the number of quantized points in the path
	var _currentPose = new PS.Packet.Pose(new THREE.Vector3(), new THREE.Quaternion());
	var _currentMode = -1;
	var _prevCamera;
	var _nextCamera;

	var _canvas;
	var _snapTween;
	var _seadragonDraggingCursorEnabled = false;

	this.getCropping = function (camera, fov) {

		var virtualCamera = _that.renderer.getCamera();

		var w   = _resizeState.width;
		var h   = _resizeState.height;

		var fovy = fov ? fov : virtualCamera.fov; //if the fov is not provided, will use the one of the renderer camera
		var fovx = 2*Math.atan(virtualCamera.aspect*Math.tan(fovy*Math.PI/360))*180/Math.PI;

		var distance = (camera.aspectRatio < virtualCamera.aspect) ?
			h / (2 * Math.tan(fovy * Math.PI / 360)) :
			w / (2 * Math.tan(fovx * Math.PI / 360));

		var width  = 2*distance*Math.tan(camera.fovx*Math.PI/360);
		var height = 2*distance*Math.tan(camera.fovy*Math.PI/360);

		return {
			x: _resizeState.scale*Math.round((w-width)/2.0),
			y: _resizeState.scale*Math.round((h-height)/2.0),
			w: _resizeState.scale*Math.round(width),
			h: _resizeState.scale*Math.round(height)
		};
	};

	this.getWebGLViewer = function() {
		_options.onLog({type: "Warning", message: "deprecated, you can use the .renderer property now instead"});
		return _that.renderer;
	};

	this.getPath = function() {
		_options.onLog({type: "Warning", message: "deprecated, you can use the .path property now instead"});
		return _that.dataset.path;
	};

	this.setDebugBlending = function(percent) {
		if (_options.debugBlendingEnabled) {
			for (var i=0; i<_that.dataset.cameras.length; ++i) {
				_that.dataset.cameras[i].lowMaterial.uniforms.debugBlending.value = percent;
				_that.dataset.cameras[i].highMaterial.uniforms.debugBlending.value = percent;
			}
			_that.renderer.forceRenderFrame();
		}
	};

	this.setCameraMode = function(mode) {
		if (_currentMode === mode) {
			return;
		}

		_currentMode = mode;
		_that.renderer.setCameraMode(mode);
		_that.cameraController.setCameraMode(mode);

		if (mode === PS.Packet.CameraMode.Global) {
			_that.dataset.frustums.visible = true;
			for (var i=0; i<_that.dataset.camerasAxes.length; ++i) {
				_that.dataset.camerasAxes[i].visible = true;
			}
			for (var i=0; i<_that.dataset.particleSystems.length; ++i) {
				_that.dataset.particleSystems[i].visible = true;
			}
			_that.dataset.smoothCameraPath.visible = true;
			_that.dataset.linearCameraPath.visible = true;
			_that.dataset.origin.visible = true;
			_that.setSeadragonDraggingCursor(true);
		}
		else {
			_that.dataset.frustums.visible = false;
			for (var i=0; i<_that.dataset.camerasAxes.length; ++i) {
				_that.dataset.camerasAxes[i].visible = false;
			}
			for (var i=0; i<_that.dataset.particleSystems.length; ++i) {
				_that.dataset.particleSystems[i].visible = false;
			}
			_that.dataset.smoothCameraPath.visible = false;
			_that.dataset.linearCameraPath.visible = false;
			_that.dataset.origin.visible = false;
			_that.setSeadragonDraggingCursor(false);
		}
		_options.onCameraModeChanged(mode);
	};

	this.__defineGetter__("path", function() {
		console.log("deprecated, please use: dataset.path instead");
		return _that.dataset.path;
	});

	this.setDampingFactor = function(/*factor*/) {
		//_that.cameraController.setDampingFactor(factor);
		//TODO: figure out inertia and add damping factor back in
		_options.onLog({type: "Warning", message: "inertia has been removed due to a change so this as no effect"});
	};

	this.setPointSize = function(size) {
		_that.dataset.pointCloudMaterial.size = size;
		_that.renderer.forceRenderFrame();
	};

	this.getClosestCamera = function(qIndex) {
		_options.onLog({type: "Warning", message: "deprecated, use .path.getClosestCamera(qIndex)"});
		return _that.dataset.path.getClosestCamera(qIndex);
	};

	this.getDominantColors = function() {
		return _that.dataset.dominantColors;
	};

	this.getStartPosition = function() {
		return _that.dataset.startTransitionPercent;
	};

	this.getCurrentPose = function() {
		return new PS.Packet.Pose(_currentPose.position, _currentPose.orientation);
	};

	this.getCurrentQIndex = function() {
		return _currentQIndex;
	};

	this.getCurrentCameraMode = function() {
		return _currentMode;
	};

	this.gotoCamera = function(camera, options) {

		var defaultOptions = {
			speedFactor: 4,
			prefetchSeadragon: true,
			onCameraChanged: true,
			onComplete: function() {}
		};
		PS.extend(defaultOptions, options);

		if (_prevCamera === camera || _nextCamera === camera) {
			_that.snapToCamera(camera, options);
		}
		else {

			if (_isAnimating) {
				_isAnimating = false;
				_options.onStopAnimating(_frameCounter);
			}

			_that.cameraController.forceInputMode(4); //TransitionToPortal: disable user input

			var srcQIndex = _currentQIndex;
			var dstQIndex = camera.qIndex;

			//fixing snapping from ~0 to ~1024
			if (_that.dataset.path.isClosed) {
				var halfNbPoints = _that.dataset.path.nbPoints/2;
				if (Math.abs(dstQIndex-srcQIndex) > halfNbPoints) {
					if (srcQIndex<halfNbPoints) {
						srcQIndex += _that.dataset.path.nbPoints;
					}
					else {
						dstQIndex += _that.dataset.path.nbPoints;
					}
				}
			}

			var length = Math.abs(dstQIndex-srcQIndex);
			var duration = 16.67*length/(_options.animateSpeed*defaultOptions.speedFactor);

			_that.dataset.path.createPersistentVirtualPath(camera);

			_that.stopSnappingToCamera();

			if (defaultOptions.prefetchSeadragon) {
				_options.startDownloadingTiles(camera, false);
			}

			_snapTween = new PS.Tween.create({
				duration: duration,
				start: srcQIndex,
				end: dstQIndex,
				onUpdate: function(index/*, percent*/) {
					_that.setPosition(index);
					_that.cameraController.setCurrentArcPosition(index);
					//camera.smoothedScale = srcScale.clone().lerp(dstScale, percent);
					//otherCamera.smoothedScale = otherSrcScale.clone().lerp(otherDstScale, percent);
				},
				onComplete: function() {
					_that.cameraController.forceInputMode(2); //TransitionToSeadragon: enable user input
					_that.setPosition(dstQIndex);
					//camera.smoothedScale = dstScale;
					//otherCamera.smoothedScale = otherDstScale;
					//path.removePersistentVirtualPath();
					if (_options.virtualPathEnabled) {
						_that.dataset.path.createTemporaryVirtualPath(camera);
					}
					if (defaultOptions.onCameraChanged) {
						_options.onCameraChanged(camera);
					}
					defaultOptions.onComplete();
				}
			}).start();
		}
	};

	this.snapToCamera = function(camera, options) {

		if (_isAnimating) {
			_isAnimating = false;
			_options.onStopAnimating(_frameCounter);
		}

		var defaultOptions = {
			duration: 300,
			onComplete: function() {}
		};
		PS.extend(defaultOptions, options);

		//just call the onCameraChanged callback if we are already on the camera pose
		var currentCamera = _that.renderer.getCamera();
		if (currentCamera.position.equals(camera.pose.position) && currentCamera.quaternion.equals(camera.pose.orientation)) { //I've modified Three.Quaternion.Slerp so that quaternion stay untouched when slerp param = 1 or 0
			if (_options.virtualPathEnabled) {
				_that.dataset.path.createTemporaryVirtualPath(camera);
			}
			_options.onCameraChanged(camera);
			defaultOptions.onComplete();

			return;
		}

		var srcQIndex = _that.dataset.path.fixRange(_currentQIndex);
		var dstQIndex = camera.qIndex;
		var srcPose   = _currentPose.clone();
		var dstPose   = camera.pose;
		var srcScale  = camera.smoothedScale.clone();
		var dstScale  = new THREE.Vector4(1,1,1,1);

		// the camera being rendered that is not being snapped to
		var otherCamera = (camera === _prevCamera) ? _nextCamera : _prevCamera;
		var otherSrcScale = otherCamera.smoothedScale.clone();
		var otherDstScale = (camera === _prevCamera) ? otherCamera.balanceToPrevious.clone() : otherCamera.balanceToNext.clone();

		//fixing snapping from ~0 to ~1024
		if (_that.dataset.path.isClosed) {
			var halfNbPoints = _that.dataset.path.nbPoints/2;
			if (Math.abs(dstQIndex-srcQIndex) > halfNbPoints) {
				if (srcQIndex<halfNbPoints) {
					srcQIndex += _that.dataset.path.nbPoints;
				}
				else {
					dstQIndex += _that.dataset.path.nbPoints;
				}
			}
		}

		_that.stopSnappingToCamera();

		_options.startDownloadingTiles(camera, false);

		_snapTween = new PS.Tween.create({
			duration: defaultOptions.duration,
			start: srcQIndex,
			end: dstQIndex,
			onUpdate: function(index, percent) {
				_that.cameraController.setCurrentArcPosition(index);
				_that.setPositionBetweenPoses(srcPose, dstPose, percent, index);
				camera.smoothedScale = srcScale.clone().lerp(dstScale, percent);
				otherCamera.smoothedScale = otherSrcScale.clone().lerp(otherDstScale, percent);
			},
			onComplete: function() {
				_that.setPositionBetweenPoses(srcPose, dstPose, 1.0, camera.qIndex);
				camera.smoothedScale = dstScale;
				otherCamera.smoothedScale = otherDstScale;

				if (_options.virtualPathEnabled) {
					_that.dataset.path.createTemporaryVirtualPath(camera);
				}
				_options.onCameraChanged(camera);
				defaultOptions.onComplete();
			}
		}).start();
	};

	this.stopSnappingToCamera = function() {
		if (_snapTween) {
			_snapTween.stop();
		}
	};

	function animate(/*lastFrameDuration*/) {

		_frameCounter++;

		//slow down animate speed at endpoint
		if (!_that.dataset.path.isClosed) {
			var index = _that.dataset.path.fixRange(_currentQIndex);
			if (index < _that.dataset.averageQIndexDistBetweenCameras) {
				_animateSpeedFactor = index / _that.dataset.averageQIndexDistBetweenCameras * 0.5 + 0.5;
			}
			else if (index > _that.dataset.path.nbPoints-1-_that.dataset.averageQIndexDistBetweenCameras) {
				_animateSpeedFactor = (_that.dataset.path.nbPoints-1 - index) / _that.dataset.averageQIndexDistBetweenCameras * 0.5 + 0.5;
			}
			else {
				_animateSpeedFactor = 1;
			}
		}

		_currentQIndex += _options.animateSpeed*_options.animateDirection*_animateSpeedFactor*_that.dataset.path.getLocalSpeed(_currentQIndex); //*lastFrameDuration/16.67
		//if we don't care of the animation exact duration it will looks smoother without this factor lastFrameDuration/16.67
		//also due to the timer resolution I'm not really sure that this value was really accurate

		//bounce back at endpoint
		if (!_that.dataset.path.isClosed && _currentQIndex > _that.dataset.path.nbPoints-1) {
			_currentQIndex = _that.dataset.path.nbPoints-1;
			_options.animateDirection *= -1.0;
			_that.dataset.path.updateDraggingDirection(1, _options.animateDirection*2); //hack to change the dragging direction
		}
		else if (!_that.dataset.path.isClosed && _currentQIndex < 0) {
			_currentQIndex = 0;
			_options.animateDirection *= -1.0;
			_that.dataset.path.updateDraggingDirection(1, _options.animateDirection*2);
		}

		_that.setPosition(_currentQIndex);
	}

	function startAnimate(direction) {
		if (!_isAnimating) {
			_isAnimating = true;
			_options.animateDirection = direction ? direction : _that.dataset.path.getDraggingDirection(); //animation will start in the dragging direction
			_frameCounter = 0;
			_options.onStartAnimating();
		}
	}

	function stopAnimate(onStopped) {
		if (_isAnimating) {
			_isAnimating = false;
			_options.onStopAnimating(_frameCounter);
			_that.snapToCamera(_that.dataset.path.getClosestCamera(_currentQIndex, true), {
				onComplete: onStopped || function() {}
			});
		}
		_lastUserInteractionTime = new Date();
	}

	this.resetAnimateTimer = function(dontUpdateSignalState) {
		stopAnimate();
		if (!dontUpdateSignalState) {
			_that.cameraController.setCurrentArcPosition(_that.dataset.path.fixRange(_currentQIndex));
		}
	};

	this.setTransitionBetweenPoses = function(srcPose, dstPose, percent, qIndex) {
		console.log("deprecated: use this.setPositionBetweenPoses() instead");
		_that.setPositionBetweenPoses(srcPose, dstPose, percent, qIndex);
	};

	this.setPositionBetweenPoses = function(srcPose, dstPose, percent, qIndex) {
		_currentQIndex = qIndex;

		var rPose = _that.dataset.path.getPose(qIndex, _currentMode);
		rPose.pose = _that.dataset.path.getLinearInterpolation(srcPose, dstPose, percent);
		_options.onPoseChanged(rPose.pose);
		updateRenderingPose(rPose);
	};

	this.setTransitionPercent = function(qIndex) {
		console.log("deprecated: use this.setPosition() instead");
		_that.setPosition(qIndex);
	};

	this.setPosition = function(qIndex) {
		_that.dataset.path.updateDraggingDirection(_currentQIndex, qIndex);
		_currentQIndex = qIndex;

		var rPose = _that.dataset.path.getPose(qIndex, _currentMode);
		_options.onPositionChanged(qIndex, rPose);
		updateRenderingPose(rPose);
	};

	this.setPositionBetweenCameras = function(srcPose, srcFov, dstPose, dstFov, percent, qIndex) {
		_currentQIndex = qIndex;

		var rPose = _that.dataset.path.getPose(qIndex, _currentMode);
		rPose.pose = _that.dataset.path.getLinearInterpolation(srcPose, dstPose, percent);
		rPose.fov  = dstFov*percent + (1-percent)*srcFov;
		_options.onPoseChanged(rPose.pose);
		updateRenderingPose(rPose);
	};

	function updateRenderingPose(rPose) {
		if (_currentMode !== PS.Packet.CameraMode.Global) {
			//do not update _currentPose in global view as we want the camera not to move while animating
			_currentPose.copy(rPose.pose);

			var viewerCam           = _that.renderer.getCamera();
			viewerCam.position      = _currentPose.position;
			viewerCam.quaternion    = _currentPose.orientation;
		}
		_that.renderer.updateScenes(_that.dataset.cameras, rPose.prevCamIndex, rPose.nextCamIndex, rPose.percent, rPose.fov);
	}

	function updateColorBalancingSmoothing() {
		if (_prevCamera && _nextCamera) {
			//update smoothed parameters toward the unsmoothed ones
			var alpha = 1.0-_options.colorBalanceSmoothingWeight;
			_prevCamera.smoothedScale.lerp(_prevCamera.unsmoothedScale, alpha);
			_nextCamera.smoothedScale.lerp(_nextCamera.unsmoothedScale, alpha);
			_prevCamera.colorScale.value = _prevCamera.smoothedScale.clone();
			_nextCamera.colorScale.value = _nextCamera.smoothedScale.clone();

			//check if we've converged (for lazy-rendering purposes)
			if (_options.renderer.lazyRenderingEnabled) {
				var sqDiffThreshold = 0.001;
				var prevSqDiff = _prevCamera.smoothedScale.clone().sub(_prevCamera.unsmoothedScale).lengthSq();
				var nextSqDiff = _nextCamera.smoothedScale.clone().sub(_nextCamera.unsmoothedScale).lengthSq();
				if (prevSqDiff > sqDiffThreshold || nextSqDiff > sqDiffThreshold) {
					_that.renderer.forceRenderFrame();
				}
			}
		}
	}

	this.getCameras = function() {
		return _that.dataset.cameras;
	};

	this.getNbCameras = function() {
		return _that.dataset.cameras.length;
	};

	this.getUsedCamera = function() {
		var scenes = _that.renderer.getScenes();
		return [scenes[0].currentImageIndex, scenes[1].currentImageIndex];
	};

	function setDraggingDirection(div, classSuffix) {
		var inputLayerDiv = div.parentNode.getElementsByClassName("PSInputLayer")[0];
		inputLayerDiv.classList.remove("PSInputLayerVertical");
		inputLayerDiv.classList.remove("PSInputLayerHorizontal");
		inputLayerDiv.classList.add("PSInputLayer" + classSuffix);
	}

	this.setSeadragonDraggingCursor = function(enabled) {

		if (_seadragonDraggingCursorEnabled !== enabled) { //optimization (just change the css class if different than current one)
			var intputLayer = _div.parentNode.getElementsByClassName("PSInputLayer")[0];

			if (enabled) {
				intputLayer.classList.add("PSInputLayerSeadragon");
			}
			else {
				intputLayer.classList.remove("PSInputLayerSeadragon");
			}
			_seadragonDraggingCursorEnabled = enabled;
		}
	};

	function init(div, rootUrl) {

		var datasetLoaderOptions = PS.extend({}, _options); //copy the root options

		//onJSonParsed
		datasetLoaderOptions.onJsonParsed = function(json, dataset) {

			if (!_that.dataset) {
				_that.dataset = dataset;
			}

			_options.onJsonParsed(_that);
		};

		//onViewerReady
		datasetLoaderOptions.onViewerReady = function(dataset) {

			_that.dataset = dataset;
			_options.onDatasetLoaded(_that.dataset);

			setDraggingDirection(div, dataset.draggingDirectionCSSClass);
			_currentQIndex = dataset.startingCamera.qIndex;
			_currentPose.copy(dataset.startingCamera.pose);

			_options.animateSpeed = dataset.animateSpeed;

			if (!_that.renderer) {
				initWebGLViewer(div, dataset);
				_options.onCanvasCreated(_that, _canvas);
				_options.onCanvasUpdated(_that, _canvas);
			}
			else {
				resetWebGLViewer(dataset);
				_options.onCanvasUpdated(_that, _canvas);
			}

			_that.renderer.setCroppingInformations(_that.getCropping(dataset.medianCamera), dataset.medianFov);

			if (_options.startCameraMode === PS.Packet.CameraMode.Global) {
				_that.setCameraMode(PS.Packet.CameraMode.Smooth); //hack to force updating the camera in setPosition
				_that.setPosition(_currentQIndex); //TODO: use viewer state object
			}
			_that.setCameraMode(_options.startCameraMode); //a) this is updating the _lastUserInteractionTime

			_that.cameraController.resetCurrentPosition(_currentQIndex);
			_that.setPosition(_currentQIndex);

			_lastUserInteractionTime  = new Date();
			_startUserInteractionTime = new Date(+_lastUserInteractionTime.getTime()); //b) thus we need to copy the value to _startUserInteractionTime
			if (!_options.autoStartEnabled) {
				_options.onStopAnimating(-1);
			}

			//this will snap to the starting camera but not trigger seadragon downloads as all geometry files are not loaded yet.
			_that.snapToCamera(dataset.startingCamera, {
				duration: 1,
				onComplete: function() {

					if (!_that.renderer.isRenderLoopRunning()) {
						_that.renderer.startRenderLoop();
					}

					_options.onDatasetRendered(_that.dataset);
				}
			});
		};

		//onAllGeometryLoaded
		datasetLoaderOptions.onAllGeometryLoaded = function() {
			_options.onAllGeometryLoaded();

			var userHasAlreadyInteracted = _lastUserInteractionTime.getTime() !== _startUserInteractionTime.getTime();
			if (_options.autoStartEnabled && !userHasAlreadyInteracted) {
					startAnimate(_options.animateDirection); //only start animating if the user hasn't interact before
			}
			else if (!_options.autoStartEnabled && !userHasAlreadyInteracted) {

				var startingCamera = _that.dataset.startingCamera;
				var currentPose    = _that.state.currentPose;
				if (currentPose.position.equals(startingCamera.pose.position) && currentPose.orientation.equals(startingCamera.pose.orientation)) {
					//if this this is false it means that the position has been changed with .setPosition() thus do not trigger seadragon tiles downloads
					_options.startDownloadingTiles(startingCamera, true);
				}
			}
		};

		//onPointCloudLoaded
		datasetLoaderOptions.onPointCloudLoaded = function(particleSystem) {
			particleSystem.visible = _currentMode === PS.Packet.ViewMode.Global;
			_that.renderer.addInScene(particleSystem);
		};

		//getCurrentState
		datasetLoaderOptions.getViewerState = function() {
			return _that.state;
		};

		_that.datasetLoader = new PS.Packet.DatasetLoader(_that, datasetLoaderOptions);
		_that.load(rootUrl);
	}

	//TODO: replace this fake viewer state object with a real one :)
	this.state = new function() {
		this.__defineGetter__("currentPose", function() {
			return _currentPose;
		});
		this.__defineGetter__("currentQIndex", function() {
			return _currentQIndex;
		});
		this.__defineGetter__("currentMode", function() {
			return _currentMode;
		});
		this.__defineGetter__("prevCamera", function() {
			return _prevCamera;
		});
		this.__defineGetter__("nextCamera", function() {
			return _nextCamera;
		});
		this.__defineGetter__("geometryEnabled", function() {
			return _options.geometryEnabled;
		});
		this.hasUserAlreadyInteracted = function() {
			return _lastUserInteractionTime.getTime() !== _startUserInteractionTime.getTime();
		};
	};

	this.load = function(url, options) {
		_isAnimating = false;
		_that.datasetLoader.load(url, options);
	};

	var _textureToUpload = [];

	this.loadTexture = function(tex) {
		_textureToUpload.push(tex);
	};

	var _lastFrameTime = new Date();

	function onFrameUpdate() {
		var startTime = Date.now();

		//trigger onIdle() if the user hasn't interact with the viewer for 'idleDelay' ms.
		if (!_isAnimating && (startTime - _lastUserInteractionTime > _options.idleDelay)) {
			_options.onIdle();
			_lastUserInteractionTime = new Date();
		}

		//update the animation
		if (_isAnimating) {
			animate(startTime-_lastFrameTime);
		}
		_lastFrameTime = startTime;

		if (_options.colorBalanceEnabled) {
			updateColorBalancingSmoothing();
		}

		//upload textures in the queue within the time budget
		while (_textureToUpload.length > 0) {
			var tex = _textureToUpload.shift();
			_that.renderer.getRenderer().uploadTexture(tex);
			if (Date.now()-startTime > 7) { //max total upload time = 7ms
				return;
			}
		}
	}

	this.getStatus = function() {
		return {
			"c": _that.dataset.cameras.map(function(c) { //cameras
				return {
					"s":    c.isSelected ? 1 : 0, //isSelected
					"d": c.isDownloading ? 1 :0,  //isDownloading
					"a":  c.mesh.material === c.lowMaterial ? 1 : 0 //isUsingAtlas
				};
			}),
			"p": _currentQIndex,    //position
			"m": _currentMode,      //mode
			"d": _that.dataset.rootUrl, //dataset
			"v": _that.dataset.version
		};
	};

	this.togglePlay = function() {
		if (_isAnimating) {
			stopAnimate();
		}
		else {
			startAnimate();
		}
	};

	this.stopPlaying = function(onStopped) {
		if (_isAnimating) {
			stopAnimate(onStopped);
		}
		else if (_snapTween && _snapTween.running()) {
			_that.stopSnappingToCamera();
			_isAnimating = true;
			stopAnimate(onStopped);
		}
		else if (onStopped) {
			onStopped();
		}
	};

	this.startPlaying = function(direction) {
		startAnimate(direction);
	};

	this.isPlaying = function() {
		return _isAnimating;
	};

	function computeCanvasSize(containerWidth, containerHeight) {
		//this function compute the size of the webgl canvas according to the container size
		//it take into account the aspect ratio of the dataset and the maxRendersize options

		//if first try to best fit the canvas into the container by comparing the container and the dataset aspect ratio

		var containerAspect = containerWidth / containerHeight;

		var canvasWidth  = 0;
		var canvasHeight = 0;

		if (containerAspect > _that.dataset.medianAspectRatio) {
			//container wider than median imagery
			canvasWidth = containerHeight * _that.dataset.medianAspectRatio;
			canvasHeight = containerHeight;
		}
		else {
			//container narrower than median imagery
			canvasWidth  = containerWidth;
			canvasHeight = containerWidth / _that.dataset.medianAspectRatio;
		}

		var scaleFactor = 1;

		//if the total drawing area exceed the maxRenderSize then the canvas is reduce to fit maxRenderSize
		//and a scaleFactor > 1 is introduce

		if (canvasWidth*canvasHeight > _options.maxRenderSize) {
			//canvas size is bigger than maxRenderSize: we need to scale it down
			//canvasWidth[new] * scaleFactor = canvasWidth[old]
			//new = scale down, old = scale up version

			var previousCanvasWidth = canvasWidth;
			var canvasAspectRatio = canvasWidth / canvasHeight;
			canvasWidth  = Math.sqrt(_options.maxRenderSize * canvasAspectRatio);
			canvasHeight = canvasWidth / canvasAspectRatio;
			scaleFactor  = previousCanvasWidth / canvasWidth;
		}

		return {
			width:  canvasWidth,
			height: canvasHeight,
			scale:  scaleFactor
		};
	}

	function updateResizeState(containerWidth, containerHeight, mode) {

		_resizeState.containerWidth  = containerWidth;
		_resizeState.containerHeight = containerHeight;

		var canvasParams = computeCanvasSize(containerWidth, containerHeight);

		if (mode === PS.Packet.ResizeMode.Slow) { //slow: need to resize webgl canvas
			_resizeState.scale  = canvasParams.scale;
			_resizeState.width  = canvasParams.width;
			_resizeState.height = canvasParams.height;
			_resizeState.translateX = (containerWidth  - canvasParams.width)  / 2;
			_resizeState.translateY = (containerHeight - canvasParams.height) / 2;
		}
		else { //fast: only change the scaling factor and do not update the webgl canvas size
			_resizeState.scale = canvasParams.width*canvasParams.scale / _resizeState.width;
			_resizeState.translateX = (containerWidth  - _resizeState.width)  / 2;
			_resizeState.translateY = (containerHeight - _resizeState.height) / 2;
		}

		_options.onResize(_resizeState, mode);
	}

	function applyResizeState() {
		setElemTransform(_canvas, _resizeState.translateX, _resizeState.translateY, _resizeState.scale);

		var rendererSize = _that.renderer.getSize();
		if (rendererSize.x !== _resizeState.width || rendererSize.y !== _resizeState.height) {
			_that.renderer.resize(_resizeState.width, _resizeState.height);
		}
	}

	this.resize = function(containerWidth, containerHeight, mode) {

		updateResizeState(containerWidth, containerHeight, mode);

		applyResizeState();
	};

	this.getCanvasRect = function() {
		return {
			centerX: _resizeState.containerWidth  / 2,
			centerY: _resizeState.containerHeight / 2,
			w: _resizeState.width  * _resizeState.scale,
			h: _resizeState.height * _resizeState.scale
		};
	};

	this.getCanvas = function() {
		return _canvas;
	};

	function onWebGLContextLost(e) {
		e.preventDefault();
		_options.onWebGLContextLost();
	}

	function initWebGLViewer(div, dataset) {

		var inputDiv = div.parentNode.getElementsByClassName("PSInputLayer")[0]; //I'm using now a transparent div instead of the webgl canvas element

		var rendererOptions = PS.extend({}, _options.renderer);
		rendererOptions.startCameraMode     = _options.startCameraMode;
		rendererOptions.fov                 = _that.dataset.medianFov;
		rendererOptions.near                = rendererOptions.near || dataset.near;
		rendererOptions.far                 = rendererOptions.far  || dataset.far;
		rendererOptions.onLog               = _options.onLog;
		rendererOptions.onUpdate = function() {
			onFrameUpdate();
			_options.onAnimFrameRequested(_that);
		};
		rendererOptions.onCamerasChanged = function(a,b) {
			_prevCamera = _that.dataset.cameras[a];
			_nextCamera = _that.dataset.cameras[b];
			_that.datasetLoader.updateSlidingWindow(_that.state);
			_options.onCamerasChanged(a,b);
		};

		updateResizeState(_options.width, _options.height, PS.Packet.ResizeMode.Slow);
		_that.renderer = new PS.Packet.Renderer(_that, div, _resizeState.width, _resizeState.height, inputDiv, rendererOptions);
		_canvas = _that.renderer.getRenderer().domElement;
		_canvas.addEventListener("webglcontextlost", onWebGLContextLost, false);
		applyResizeState();

		_that.onGPUMemoryChange();
		_that.dataset.cameras.forEach(function(c) { c.viewer = _that; });
		var canvas = _that.renderer.getRenderer().domElement;
		canvas.style.position = "relative";

		_that.renderer.addInScene(_that.dataset.frustums);
		_that.renderer.addInScene(_that.dataset.smoothCameraPath);
		_that.renderer.addInScene(_that.dataset.linearCameraPath);
		_that.renderer.addInScene(_that.dataset.origin);
		for (var i=0; i<_that.dataset.camerasAxes.length; ++i) {
			var axes = _that.dataset.camerasAxes[i];
			_that.renderer.addInScene(axes);
		}

		_that.cameraController = new PS.Packet.MultiViewCameraController(inputDiv, _that, _that.seadragonViewer, _that.dataset.path, _currentQIndex, _that.dataset.draggingDirection, _options.animateSpeed, {
			onTapped:          _options.onTapped,
			onLog:             _options.onLog,
			onKeyDown:         _options.onKeyDown,
			onKeyUp:           _options.onKeyUp,
			onCtrlClick:       _options.onCtrlClick,
			onInputModeChange: _options.onInputModeChange
		});
	}

	function resetWebGLViewer() {

		updateResizeState(_resizeState.containerWidth, _resizeState.containerHeight, PS.Packet.ResizeMode.Slow); //update resize setting according to dataset
		_that.renderer.reset(_that.dataset);
		_that.dataset.cameras.forEach(function(c) { c.viewer = _that; });

		//add global geometry
		_that.renderer.addInScene(_that.dataset.frustums);
		_that.renderer.addInScene(_that.dataset.smoothCameraPath);
		_that.renderer.addInScene(_that.dataset.linearCameraPath);
		_that.renderer.addInScene(_that.dataset.origin);
		for (var i=0; i<_that.dataset.camerasAxes.length; ++i) {
			var axes = _that.dataset.camerasAxes[i];
			_that.renderer.addInScene(axes);
		}

		_that.cameraController.reset(_that.dataset);

		applyResizeState(); //calling renderer.resize();
	}

	init(div, rootUrl);
};
