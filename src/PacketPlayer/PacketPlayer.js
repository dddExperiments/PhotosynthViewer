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

	PS.Packet.Player :
	------------------

	This is the main object that you want to interact with.
	It contains the SeadragonViewer used to display images at rest and the PacketPlayer used to display ImageBasedRendering transition with webgl.
	It also contains the MetadataViewer containing the toolbar and the MapViewer.

	Enum:
	- PS.Packet.ViewMode
		- different view mode for the virtual camera (smooth path, linear interpolation, global view)
	- PS.Packet.ResizeMode
		- fast or slow resize mode
	- PS.Packet.PresetGPU
		- preset GPU for different platform

	Public member:
	- packetViewer;
	- seadragonViewer;
	- metadataViewer;
	- mapViewer;

	Public method:
	- getDiv()
	- toggleFullscreen(e)
	- resize(width, height, resizeMode)
		- resizeMode = PS.Packet.ResizeMode.
	- setCameraMode(mode)
		- mode = PS.Packet.ViewMode
	- toggleCameraMode() -> toggle between smooth/global camera mode
	- load(rootUrl)
		- rootUrl = http link to the root of the synth packet to render (don't forget corsEnabled for cross-domain)
	- preload(rootUrl, onPreloaded)
		- onPreloaded(dataset)
	- setActiveDataset(dataset)
		- dataset = object return in the onPreloaded callback
	- getAnnotationInfo(point, onComplete)
		- point in original image space [0,1]x[0,1] (0,0) = top left
		- onComplete(point, geometryFileIndex, cameraFileIndex, currentCamera)
	- unload()

*/

PS.Packet.ViewMode = {
	Smooth: 0, //virtual camera is moving on the smooth path
	Linear: 1, //virtual camera is moving on the linear interpolated path (between adjacent cameras)
	Global: 2  //virtual camera is free to move (global view 'c')
};

PS.Packet.ResizeMode = {
	Fast: 0, //css scaling only
	Slow: 1  //resize the webgl renderer too
};

PS.Packet.PresetGPU = {
	TabletPhone: 0,
	Laptop:      1,
	Desktop:     2,
	Extreme:     3,
	Custom:      4
};

PS.Packet.Player = function(div, options) {

	var _div  = div;
	var _that = this;
	var _options = { //default options
		width: 1280,
		height: 720,
		guid: "",                     //can only be use when the viewer is hosted on photosynth.net
		packetURL: "",                //url to the synth packet
		embedThumbURL: "",            //url to the thumb used for background for the click to load behavior
		logoURL: "",                  //url triggered when clicking on the logo
		logoTarget: "_blank",         //target for the logo link (_top to open in the same window)
		autoLoad:              true,  //if enabled, will start loading dataset immediately, otherwise it will first display a poster with a click to load button
		seadragonEnabled:      true,  //if enabled, will allow to display multi-res image on resting (snapOnRelax=true and isMouseWheelEnabled=false are needed)
		autoResizeEnabled:     true,  //if enabled, the player will resize automatically (using CSS transform) while resizing the browser window
		mapEnabled:            true,  //if enabled, will display a mini map (top view)
		corsEnabled:           false, //if enabled, will add the cors header to image request used for webgl
		debugMenuEnabled:      true,  //if enabled, typing 4 then 2 will display a hidden menu (with lots of options)
		startCameraMode: PS.Packet.ViewMode.Smooth, //change the start camera view mode of the player
		loggingEnabled:        false, //if enabled, will dump to the console
		onLog: function() {},
		onToggleFullscreen: function() {},
		viewer: {
			onJsonParsed: function() {},
			onCanvasCreated: function() {},
			onCanvasUpdated: function() {},
			onBeginDownloading: function() {},
			onFinishDownloading: function() {},
			onStartAnimating: function() {},
			onStopAnimating: function() {},
			onCameraModeChanged: function() {},
			onCameraChanged: function() {},
			onCamerasChanged: function() {},
			onPositionChanged: function() {},
			onAllGeometryDownloaded: function() {},
			onPoseChanged: function() {},
			onKeyDown: function() {},
			onKeyUp: function() {},
			startTransitionPercent: -1,
			startCameraIndex: -1,
			pointCloudEnabled: false,
			geometryEnabled: true,
			colorBalanceEnabled: true,
			pathFixingEnabled: true,
			debugBlendingEnabled: false,
			progressBarEnabled: false,
			extendPathEnabled: true,
			smoothFovEnabled: true,
			smoothSpeedEnabled: false,
			virtualPathEnabled: true,
			renderer: {
				croppingEnabled:      true,
				holeFillingEnabled:   true,
				lazyRenderingEnabled: true,
				blendingFunction:     PS.Packet.BlendingFunction.Linear,
				blendingMode:         PS.Packet.BlendingMode.Opacity,
				blendingSigma:        0.5
			},
			presetGPU: PS.Packet.PresetGPU.Laptop
		},
		seadragonViewer: {
			onPositionChanged: function () {},
			onResize: function() {},
			onZoomLevelStateChanged: function() {}
		},
		metadata: {
			title: "",
			enableLogo: true,
			enableGlobalView: false,
			enable3DToggle: false,
			enableFullscreen: true,
			toolbarPosition: "center",
			progressPosition: "center"
		},
		map: {
			isVisible: false
		}
	};
	PS.extend(_options, options);                                                   //overriding default options with user provided options
	PS.extend(_options.viewer,   {width: _options.width, height: _options.height}); //sending w,h options to the packet viewer
	PS.extend(_options.metadata, {width: _options.width, height: _options.height}); //sending w,h options to the meta viewer
	PS.extend(_options.viewer, {corsEnabled: _options.corsEnabled});                //sending cors enabled option to the packet viewer
	PS.extend(_options.viewer, presetGpuToOptions(_options.viewer.presetGPU));      //override custom rendering options by the one from the presetGPU if different from PS.Packet.PresetGPU.Custom

	if (_options.guid === "" && _options.packetURL === "") {
		console.log("You need to provide a guid or a packetURL as option");
		return;
	}

	var _dominantColor;

	var _packetPlayerDiv;
	var _packetViewerDiv;
	//var _metadataViewerDiv; //PSMetadataViewer merged into PSInputLayer
	var _seadragonViewerDiv;
	var _mapViewerDiv;
	var _inputDiv;

	var _isLoaded = false;
	var _pendingImages = {};

	var _resizeTimer;
	var _resizeTimeout = null;
	var _currentCamera = null;
	var _startAnimateTime;

	var _4_was_down = false;
	var _timer_2; //42 easter egg
	var _gui;
	var _guiParams = {

		//General
		reset:                function() { PS.Packet.ViewerOptions.reset(); },
		consoleLogging:       _options.loggingEnabled,
		geometry:             _options.viewer.geometryEnabled,
		seadragon:            _options.seadragonEnabled,
		mapVisibleAtStartup:  _options.map.isVisible,
		pointCloud:           _options.viewer.pointCloudEnabled,
		pointCloudSize:       0.05,
		cameraMode:           _options.startCameraMode,

		//Rendering:
		cropping:         _options.viewer.renderer.croppingEnabled,
		holeFilling:      _options.viewer.renderer.holeFillingEnabled,
		colorBalance:     _options.viewer.colorBalanceEnabled,
		lazyRendering:    _options.viewer.renderer.lazyRenderingEnabled,
		polygonColor:     _options.viewer.debugBlendingEnabled,
		polygonBlending:  1.0,
		blendingMode:     _options.viewer.renderer.blendingMode,
		blendingFunction: _options.viewer.renderer.blendingFunction,
		blendingSigma:    _options.viewer.renderer.blendingSigma,

		//Path
		endpoint:        _options.viewer.extendPathEnabled,
		smoothFov:       _options.viewer.smoothFovEnabled,
		smoothSpeed:     _options.viewer.smoothSpeedEnabled,
		virtualOnRest:   _options.viewer.virtualPathEnabled,
		pathFixing:      _options.viewer.pathFixingEnabled,

		//UI
		toggleGlobalView: _options.metadata.enableGlobalView,
		toggle3D:         _options.metadata.enable3DToggle,
		progressBar:      _options.viewer.progressBarEnabled,
		position:         _options.metadata.toolbarPosition,

		//GPU
		presetGPU:        _options.viewer.presetGPU,
		texturesMemoryUsage: 0,
		buffersMemoryUsage:  0,
		totalMemoryUsage:    0
	};

	this.getDiv = function() {
		return _packetPlayerDiv;
	};

	this.setBackgroundColor = function(color) {
		_dominantColor = color.getStyle();
		_that.packetViewer.getCanvas().style.backgroundColor = _dominantColor;

		if (_options.startCameraMode !== PS.Packet.ViewMode.Global) {
			_packetPlayerDiv.style.backgroundColor = _dominantColor;
		}
		else {
			_packetPlayerDiv.style.backgroundColor = "";
		}
	};

	function displayHiddenMenu() {
		if (!_isLoaded) {
			return;
		}
		else if (!_gui && _options.debugMenuEnabled) {

			_gui = new dat.GUI({ width : 330 });
			_gui.domElement.parentNode.style.zIndex = 8;

			//General
			var generalFolder = _gui.addFolder("General");
			generalFolder.add(_guiParams, 'reset').name("Reset settings");

			var consoleLoggingControl = generalFolder.add(_guiParams, 'consoleLogging');
			consoleLoggingControl.onChange(function(value) {
				PS.Packet.ViewerOptions.override({loggingEnabled: value});
			});

			var geometryControl = generalFolder.add(_guiParams, 'geometry');
			geometryControl.onChange(function(value) {
				_that.packetViewer.setOptions({geometryEnabled: value});
				PS.Packet.ViewerOptions.override({viewer: {geometryEnabled: value}});
			});

			var seadragonWasEnabled = _options.seadragonEnabled;
			var seadragonControl = generalFolder.add(_guiParams, 'seadragon').listen();
			seadragonControl.onChange(function(value) {
				if (seadragonWasEnabled) {
					_that.seadragonViewer.setForceVisible(value);
					_that.packetViewer.cameraController.setSeadragonEnabled(value);
				}
				PS.Packet.ViewerOptions.override({seadragonEnabled: value});
			});

			var pathFixingControl = generalFolder.add(_guiParams, 'pathFixing');
			pathFixingControl.onChange(function(value) {
				PS.Packet.ViewerOptions.override({viewer: {pathFixingEnabled: value}});
			});

			var mapVisibleControl = generalFolder.add(_guiParams, 'mapVisibleAtStartup');
			mapVisibleControl.onChange(function(value) {
				PS.Packet.ViewerOptions.override({map: { isVisible: value}});
			});

			var pointCloudControl = generalFolder.add(_guiParams, 'pointCloud');
			pointCloudControl.onChange(function(value) {
				PS.Packet.ViewerOptions.override({viewer: { pointCloudEnabled: value}});
			});

			if (_options.viewer.pointCloudEnabled) {
				var pointCloudSizeControl = generalFolder.add(_guiParams, 'pointCloudSize', 0.01, 0.3);
				pointCloudSizeControl.onChange(function(value) {
					_that.packetViewer.setPointSize(value);
				});
			}

			var cameraModeControl = generalFolder.add(_guiParams, 'cameraMode', {
				"Smooth": PS.Packet.CameraMode.Smooth,
				"Linear": PS.Packet.CameraMode.Linear,
				"Global": PS.Packet.CameraMode.Global
			}); //.listen(); buggy
			cameraModeControl.onFinishChange(function(value) {

				value = parseInt(value, 10);

				if (value === PS.Packet.CameraMode.Global) {
					_guiParams.holeFilling = false;
					_that.packetViewer.renderer.setHoleFillingEnabled(false);
				}
				else {
					_guiParams.holeFilling = true;
					_that.packetViewer.renderer.setHoleFillingEnabled(true);
				}
				_that.setCameraMode(value);
			});

			generalFolder.open();

			//Rendering
			var renderingFolder = _gui.addFolder("Rendering");

			var croppingControl = renderingFolder.add(_guiParams, 'cropping');
			croppingControl.onChange(function(value) {
				_that.packetViewer.renderer.setCroppingEnabled(value);
				PS.Packet.ViewerOptions.override({viewer: {renderer: {croppingEnabled: value}}});
			});

			var holeFillingControl = renderingFolder.add(_guiParams, 'holeFilling');
			holeFillingControl.onChange(function(value) {
				_that.packetViewer.renderer.setHoleFillingEnabled(value);
				PS.Packet.ViewerOptions.override({viewer: {renderer: {holeFillingEnabled: value }}});
			});

			var colorBalanceControl = renderingFolder.add(_guiParams, 'colorBalance');
			colorBalanceControl.onChange(function(value) {
				_that.packetViewer.setOptions({colorBalanceEnabled: value});
				PS.Packet.ViewerOptions.override({viewer: { colorBalanceEnabled: value }});
			});

			var lazyRenderingControl = renderingFolder.add(_guiParams, 'lazyRendering');
			lazyRenderingControl.onChange(function(value) {
				_that.packetViewer.renderer.setOptions({lazyRenderingEnabled: value });
				PS.Packet.ViewerOptions.override({viewer: { renderer: {lazyRenderingEnabled: value }}});
			});

			var polygonColorControl = renderingFolder.add(_guiParams, 'polygonColor');
			polygonColorControl.onChange(function(value) {
				PS.Packet.ViewerOptions.override({viewer: { debugBlendingEnabled: value}});
			});

			if (_options.viewer.debugBlendingEnabled) {
				var polygonBlendingControl = renderingFolder.add(_guiParams, 'polygonBlending', 0.0, 1.0);
				polygonBlendingControl.onChange(function(value) {
					_that.packetViewer.setDebugBlending(value);
				});
			}

			var blendingModeControl = renderingFolder.add(_guiParams, 'blendingMode', {
				"Opacity": PS.Packet.BlendingMode.Opacity,
				"Dithering Luminance": PS.Packet.BlendingMode.DitheringLuminance,
				"Dithering Color": PS.Packet.BlendingMode.DitheringColor,
				"Feathering": PS.Packet.BlendingMode.Feathering
			});
			blendingModeControl.onChange(function(value) {
				value = parseInt(value, 10);
				PS.Packet.ViewerOptions.override({viewer: { renderer: {blendingMode: value }}});
			});

			var blendingFunctionControl = renderingFolder.add(_guiParams, 'blendingFunction', {
				"Linear": PS.Packet.BlendingFunction.Linear,
				"Step": PS.Packet.BlendingFunction.Step,
				"Sigmoid": PS.Packet.BlendingFunction.Sigmoid
			});
			blendingFunctionControl.onChange(function(value) {
				value = parseInt(value, 10);
				_that.packetViewer.renderer.setOptions({blendingFunction: value });
				PS.Packet.ViewerOptions.override({viewer: { renderer: {blendingFunction: value }}});
			});

			if (_options.viewer.renderer.blendingFunction === PS.Packet.BlendingFunction.Sigmoid) {
				var blendingSigmaControl = renderingFolder.add(_guiParams, 'blendingSigma', 0.0, 1.0);
				blendingSigmaControl.onChange(function(value) {
					_that.packetViewer.renderer.setOptions({blendingSigma: value });
					PS.Packet.ViewerOptions.override({viewer: { renderer: {blendingSigma: value }}});
				});
			}

			renderingFolder.open();

			//Path
			var pathFolder = _gui.addFolder("Path");

			var endpointControl = pathFolder.add(_guiParams, 'endpoint');
			endpointControl.onChange(function(value) {
				_that.packetViewer.dataset.path.setOptions({extendPathEnabled: value});
				PS.Packet.ViewerOptions.override({viewer: {extendPathEnabled: value}});
			});

			var smoothFovControl = pathFolder.add(_guiParams, 'smoothFov');
			smoothFovControl.onChange(function(value) {
				PS.Packet.ViewerOptions.override({viewer: {smoothFovEnabled: value}});
			});

			var smoothSpeedControl = pathFolder.add(_guiParams, 'smoothSpeed');
			smoothSpeedControl.onChange(function(value) {
				PS.Packet.ViewerOptions.override({viewer: {smoothSpeedEnabled: value}});
			});

			var virtualOnRestControl = pathFolder.add(_guiParams, 'virtualOnRest');
			virtualOnRestControl.onChange(function(value) {
				_that.packetViewer.setOptions({virtualPathEnabled: value});
				PS.Packet.ViewerOptions.override({viewer: {virtualPathEnabled: value}});
			});

			var pathFixingControl = pathFolder.add(_guiParams, 'pathFixing');
			pathFixingControl.onChange(function(value) {
				PS.Packet.ViewerOptions.override({viewer: {pathFixingEnabled: value}});
			});

			//UI
			var uiFolder = _gui.addFolder("UI");

			var toggleGlobalViewControl = uiFolder.add(_guiParams, 'toggleGlobalView');
			toggleGlobalViewControl.onChange(function(value) {
				PS.Packet.ViewerOptions.override({metadata: {enableGlobalView: value }});
			});

			var toggle3DControl = uiFolder.add(_guiParams, 'toggle3D');
			toggle3DControl.onChange(function(value) {
				PS.Packet.ViewerOptions.override({metadata: {enable3DToggle: value }});
			});

			var progressBarControl = uiFolder.add(_guiParams, 'progressBar');
			progressBarControl.onChange(function(value) {
				PS.Packet.ViewerOptions.override({viewer: {progressBarEnabled: value }});
			});

			var positionControl = uiFolder.add(_guiParams, 'position', {"right": "right", "center": "center"});
			positionControl.onChange(function(value) {
				PS.Packet.ViewerOptions.override({metadata: {position: value }});
			});

			//GPU
			var gpuFolder = _gui.addFolder("GPU");

			gpuFolder.add(_guiParams, 'texturesMemoryUsage', 0, 200).listen();
			gpuFolder.add(_guiParams, 'buffersMemoryUsage',  0, 200).listen();
			gpuFolder.add(_guiParams, 'totalMemoryUsage',    0, 200).listen();

			var viewingSettingControl = gpuFolder.add(_guiParams, 'presetGPU', {"Tablet/Phone": PS.Packet.PresetGPU.TabletPhone, "Laptop": PS.Packet.PresetGPU.Laptop, "Desktop": PS.Packet.PresetGPU.Desktop, "Extreme": PS.Packet.PresetGPU.Extreme});
			viewingSettingControl.onFinishChange(function(value) {
				var settings = presetGpuToOptions(parseInt(value, 10));
				PS.Packet.ViewerOptions.override({viewer: settings});
			});
		}
		else if (_options.debugMenuEnabled) {
			_gui.closed = !_gui.closed;
		}
	}

	function presetGpuToOptions(preset) {
		var settings = {};
		switch (preset) {
			case PS.Packet.PresetGPU.TabletPhone:
				settings.maxRenderSize     = 800*600;
				settings.maxHDPixels       = 512*384;
				settings.gpuHDMemoryBudget = 50;
			break;

			case PS.Packet.PresetGPU.Desktop:
				settings.maxRenderSize     = 1920*1080;
				settings.maxHDPixels       = 800*600;
				settings.gpuHDMemoryBudget = 150;
			break;

			case PS.Packet.PresetGPU.Extreme:
				settings.maxRenderSize     = 1920*1080;
				settings.maxHDPixels       = 1920*1080;
				settings.gpuHDMemoryBudget = 200;
			break;

			case PS.Packet.PresetGPU.Custom:
			break;

			default: //laptop GPU
				settings.maxRenderSize     = 1024*768;
				settings.maxHDPixels       = 720*576;
				settings.gpuHDMemoryBudget = 80;
		}
		settings.presetGPU = preset;

		return settings;
	}

	function getPacketUrl() {
		if (_options.packetURL === "") {
			return "/ps2/"+_options.guid+"/packet/";
		}
		else {
			return _options.packetURL;
		}
	}

	function fullscreenEnabled() {
		return document.fullscreenEnabled ||
			document.msFullscreenEnabled  ||
			document.mozFullScreenEnabled ||
			document.webkitFullscreenEnabled;
	}

	this.toggleFullscreen = function(e) {
		toggleFullscreen(e);
	};

	function toggleFullscreen() {

		//W3C Fullscreen API: https://dvcs.w3.org/hg/fullscreen/raw-file/tip/Overview.html

		if (!document.fullscreenElement && !document.msFullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement) {
			if (_packetPlayerDiv.requestFullscreen) { //standard
				_packetPlayerDiv.requestFullscreen();
			}
			else if (_packetPlayerDiv.msRequestFullscreen) { //IE
				_packetPlayerDiv.msRequestFullscreen();
			}
			else if (_packetPlayerDiv.webkitRequestFullscreen) { //Chrome
				_packetPlayerDiv.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
			}
			else if (_packetPlayerDiv.mozRequestFullScreen) { //Firefox
				_packetPlayerDiv.mozRequestFullScreen();
			}
		}
		else {
			if (document.exitFullscreen) { //standard
				document.exitFullscreen();
			}
			else if (document.msExitFullscreen) { //IE
				document.msExitFullscreen();
			}
			else if (document.webkitCancelFullScreen) { //Chrome
				document.webkitCancelFullScreen();
			}
			else if (document.mozCancelFullScreen) { //Firefox
				document.mozCancelFullScreen();
			}
		}
	}

	function onFullscreenChange() {
		var fullscreenElem = document.fullscreenElement || document.msFullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;

		if (fullscreenElem) {
			_that.metadataViewer.setFullscreenButtonState("exitFullscreen");
			_options.onToggleFullscreen(true);
		}
		else {
			_that.metadataViewer.setFullscreenButtonState("fullscreen");
			_options.onToggleFullscreen(false);
		}
		var width = (fullscreenElem) ? screen.width : _options.width;
		var height = (fullscreenElem) ? screen.height : _options.height;

		_that.resize(width, height, PS.Packet.ResizeMode.Slow);
	}

	this.resize = function (width, height, resizeMode) {

		var widthStyle = width + "px";
		var heightStyle = height + "px";

		_that.packetViewer.resize(width, height, resizeMode);
		_that.metadataViewer.resize(width, height);
		_that.mapViewer.resize(width, height, resizeMode);

		_packetPlayerDiv.style.width = widthStyle;
		_packetPlayerDiv.style.height = heightStyle;

		_inputDiv.style.width = widthStyle;
		_inputDiv.style.height = heightStyle;

		//PSMetadataViewer merged into PSInputLayer
		//_metadataViewerDiv.style.width = widthStyle;
		//_metadataViewerDiv.style.height = heightStyle;

		if (_options.seadragonEnabled && _currentCamera && _that.seadragonViewer.openSeadragon) {
			_that.seadragonViewer.setCropping(_that.packetViewer.getCropping(_currentCamera));
			_that.seadragonViewer.openSeadragon.viewport.goHome(true);

			if (_resizeTimeout !== null) {
				clearTimeout(_resizeTimeout);
			}

			if (_that.seadragonViewer.openSeadragon.viewport) { //might be enabled but not used if there is no seadragon pyramid in this packet
				_resizeTimeout = setTimeout(function () {
					//TODO: This is a hack, but is required due to a bug in openseadragon.  In the future, we should just fix openseadragon.
					//      Openseadragon will sometimes distort the imagery after going fullscreen until the camera has moved.
					//      So move the camera and then snap it back to home.  The delay is required because it doesn't seem to
					//      register the new size of the container for some time afterwards.
					//      If you try to attach a listener to openSeadragon.onresize and set it there, then it causes the imagery to get stretched in one dimension.
					_that.seadragonViewer.openSeadragon.viewport.zoomBy(1.001, new OpenSeadragon.Point(0, 0), true);
					_that.seadragonViewer.openSeadragon.viewport.goHome(true);

					_resizeTimeout = null;
				}, 200);
			}
		}
	};

	this.setCameraMode = function(mode) {
		_that.packetViewer.setCameraMode(mode);
		if (_options.seadragonEnabled) {
			_that.seadragonViewer.setVisible(false);
		}
		if (mode === PS.Packet.ViewMode.Global) {
			_packetPlayerDiv.style.backgroundColor = "";
		}
		else {
			_packetPlayerDiv.style.backgroundColor = _dominantColor;
		}
		_that.metadataViewer.setCameraMode(mode);
	};

	this.toggleCameraMode = function() {
		var currentMode = _that.packetViewer.getCurrentCameraMode();
		var newMode = currentMode === PS.Packet.ViewMode.Smooth ? PS.Packet.ViewMode.Global : PS.Packet.ViewMode.Smooth;

		_that.setCameraMode(newMode);
	};

	this.load = function(rootUrl, options) {

		var currentDataset = _that.packetViewer.dataset;
		if (currentDataset && currentDataset.rootUrl === rootUrl) {
			//this dataset is already loaded
			return;
		}

		if (_options.mapEnabled) {
			_that.mapViewer.setVisible(false);
		}
		_that.packetViewer.load(rootUrl, options);
		_options.packetURL = rootUrl;
	};

	this.preload = function(rootUrl, onPreloaded) {
		_that.packetViewer.datasetLoader.preload(rootUrl, onPreloaded);
	};

	this.setActiveDataset = function(dataset) {
		if (_options.mapEnabled) {
			_that.mapViewer.setVisible(_options.map.isVisible);
		}
		_currentCamera = null;
		_options.packetURL = dataset.rootUrl;
		_that.packetViewer.datasetLoader.setActive(dataset);
	};

	function onWindowResize(e) {

		_that.resize(e.target.innerWidth, e.target.innerHeight, PS.Packet.ResizeMode.Fast);
		if (_resizeTimer) {
			clearTimeout(_resizeTimer);
		}
		_resizeTimer = setTimeout((function() {
			var w = e.target.innerWidth;
			var h = e.target.innerHeight;
			return function() {
				_that.resize(w, h, PS.Packet.ResizeMode.Slow);
			};
		})(), 300);

	}

	function load(onload) {

		var onload = onload || function() {};

		if (_isLoaded) {
			onload();
			return;
		}
		else {

			//Fullscreen support
			document.addEventListener('fullscreenchange',       onFullscreenChange, false);
			document.addEventListener('MSFullscreenChange',     onFullscreenChange, false);
			document.addEventListener('webkitfullscreenchange', onFullscreenChange, false);
			document.addEventListener('mozfullscreenchange',    onFullscreenChange, false);

			_packetViewerDiv = document.createElement("div");
			_packetViewerDiv.setAttribute("class", "PSPacketViewer");
			_packetPlayerDiv.appendChild(_packetViewerDiv);

			if (_options.seadragonEnabled) {
				_seadragonViewerDiv = document.createElement("div");
				_seadragonViewerDiv.setAttribute("class", "PSSeadragonViewer");
				_seadragonViewerDiv.style.width  = _options.width  + "px";
				_seadragonViewerDiv.style.height = _options.height + "px";
				_packetPlayerDiv.appendChild(_seadragonViewerDiv);
			}

			if (_options.mapEnabled) {
				_mapViewerDiv = document.createElement("div");
				_mapViewerDiv.setAttribute("class", "PSPacketMapViewer");
				_mapViewerDiv.style.width  = _options.width  + "px";
				_mapViewerDiv.style.height = _options.height + "px";
				_packetPlayerDiv.appendChild(_mapViewerDiv);
			}

			_inputDiv = document.createElement("div");
			_inputDiv.setAttribute("class", "PSInputLayer PSMetadataViewer"); //PSMetadataViewer merged into PSInputLayer
			_inputDiv.style.width  = _options.width  + "px";
			_inputDiv.style.height = _options.height + "px";
			_packetPlayerDiv.appendChild(_inputDiv);

			//The metadata viewer div is now merged inside the PSInputLayer due to a bug in chrome:
			//https://code.google.com/p/chromium/issues/detail?id=269598

			//_metadataViewerDiv = document.createElement("div");
			//_metadataViewerDiv.setAttribute("class", "PSMetadataViewer");
			//_metadataViewerDiv.style.width  = _options.width  + "px";
			//_metadataViewerDiv.style.height = _options.height + "px";
			//_packetPlayerDiv.appendChild(_metadataViewerDiv);

			//Build PS.Packet.Metadata.Viewer
			_options.metadata.onTogglePlay = function() {
				if (_options.seadragonEnabled) {
					if (!_that.seadragonViewer.isHomeZoom()) {
						_that.seadragonViewer.goHome();
					}
				}
				_that.packetViewer.togglePlay();
			};
			_options.metadata.onToggle3D = function(mode) {
				_that.packetViewer.setOptions({geometryEnabled: mode === "3d"});
			};
			_options.metadata.onButtonClick = function() {
				//the keyboard focus has been lost due to the mouse/touch click on the button
				//re-focusing the keyboard input used to detect keyboard inputs
				_that.packetViewer.cameraController.focusKeyboardElement();
			};
			_options.metadata.enableFullscreen = _options.metadata.enableFullscreen && fullscreenEnabled();
			_options.metadata.onToggleFullscreen = function(e) {
				toggleFullscreen(e);
			};
			_options.metadata.onZoomIn = function() {
				_that.packetViewer.renderer.simulateMouseWheel(0.3);
			};
			_options.metadata.onZoomOut = function() {
				_that.packetViewer.renderer.simulateMouseWheel(-0.3);
			};
			_options.metadata.logoURL    = _options.logoURL;
			_options.metadata.logoTarget = _options.logoTarget;
			_options.metadata.width      = _options.width;
			_options.metadata.height     = _options.height;
			_that.metadataViewer = new PS.Packet.Metadata.Viewer(_inputDiv, _that, _options.metadata); //PSMetadataViewer merged into PSInputLayer
			_that.metadataViewer.progressIndicator.setPercent(15);
			_that.metadataViewer.setCameraMode(_options.startCameraMode);

			//resize support
			if (_options.autoResizeEnabled) {
				window.addEventListener("resize", onWindowResize, false);
			}

			//Build PS.Packet.Viewer
			var userDefinedViewerOptions = PS.extend({}, _options.viewer);
			PS.extend(_options.viewer, {
				startCameraMode: _options.startCameraMode,
				onJsonParsed: function(viewer, json) {
					_that.metadataViewer.progressIndicator.setPercent(45);
					userDefinedViewerOptions.onJsonParsed(viewer, json);
				},
				onCanvasUpdated: function(viewer, canvas) {
					_that.metadataViewer.progressIndicator.setPercent(65);
					userDefinedViewerOptions.onCanvasUpdated(viewer, canvas);

					if (_options.mapEnabled) {
						_that.mapViewer.init(viewer, viewer.dataset);
					}

					_that.setBackgroundColor(viewer.dataset.getDominantColor());

					if (_options.seadragonEnabled) {
						if (viewer.getCameras()[0].originalSize.x !== 0) {
							var seadragonOptions = _that.packetViewer.getSeadragonOptions();
							seadragonOptions.onPositionChanged       = _options.seadragonViewer.onPositionChanged;
							seadragonOptions.onResize                = _options.seadragonViewer.onResize;
							seadragonOptions.onZoomLevelStateChanged = function(isHomeZoom) {
								_that.metadataViewer.setSeadragonZoomState(isHomeZoom);
								_options.seadragonViewer.onZoomLevelStateChanged(isHomeZoom);
							};
							seadragonOptions.corsEnabled             = _options.corsEnabled;
							_that.seadragonViewer.init(seadragonOptions);
						}
					}
					onload();
				},
				onKeyUp: function(e) {
					var wasUsed = false;
					if (_options.debugMenuEnabled && (e.keyCode === 100 || e.keyCode === 52)) { //4 - first character of easter egg menu (42)
						wasUsed = true;
						_4_was_down = true;
						if (_timer_2) { clearTimeout(_timer_2); }
						_timer_2 = setTimeout(function() {
							_4_was_down = false;
						}, 1000);
					}
					else if (_options.debugMenuEnabled && (e.keyCode === 98 || e.keyCode === 50)) { //2 - second character of easter egg menu (42)
						wasUsed = true;
						if (_4_was_down) {
							_4_was_down = false;
							displayHiddenMenu();
						}
					}
					else if (e.keyCode === 67) { //c - toggle camera view mode
						wasUsed = true;
						_that.toggleCameraMode();
					}
					else if (e.keyCode === 77) { // m - toggle map overlay
						wasUsed = true;
						_that.mapViewer.setVisible(!_that.mapViewer.isVisible());
					}
					else if (e.keyCode === 70) { //f - toggle fullscreen
						wasUsed = true;
						toggleFullscreen(e);
					}
					else if (e.keyCode === 32) { //space - toggle play/pause
						wasUsed = true;
						var currentClassName = _that.metadataViewer.getPlayButtonState();
						var newClassName = currentClassName === "play" ? "pause" : "play";

						_that.metadataViewer.setPlayButtonState(newClassName);
						_options.metadata.onTogglePlay(newClassName === "play" ? "stopped" : "playing");
					}

					wasUsed |= userDefinedViewerOptions.onKeyUp(e);

					return wasUsed;
				},
				onBeginDownloading: function(viewer, params) {
					if (params.type === "image") {
						_pendingImages[params.index] = true;
						_that.metadataViewer.progressIndicator.start();
					}
					userDefinedViewerOptions.onBeginDownloading(viewer, params);
				},
				onProgressPercentChange: function(value) {
					if (value === 1.0) {
						_that.metadataViewer.setProgressPercentVisibility(false);
					}
					else {
						var percent = Math.round(value*100);
						var paddedPercent = percent < 10 ? "0" + percent : percent;
						_that.metadataViewer.setProgressPercentVisibility(true);
						_that.metadataViewer.setProgressPercentText(paddedPercent);
					}
				},
				onFinishDownloading: function(viewer, params) {
					if (params.type === "image") {
						delete _pendingImages[params.index];
						var counter = 0;
						for (var i in _pendingImages) {
							if (_pendingImages.hasOwnProperty(i)) {
								counter++;
							}
						}
						if (counter === 0) {
							_that.metadataViewer.progressIndicator.stop();
						}
					}
					userDefinedViewerOptions.onFinishDownloading(viewer, params);
				},
				onAllGeometryDownloaded: function() {
					if (_options.seadragonEnabled) {
						_that.seadragonViewer.enable(); //only enable seadragon after all geometry are loaded
					}
					userDefinedViewerOptions.onAllGeometryDownloaded();
				},
				onGPUMemoryChanged: function() {
					var texUsage  = PS.Packet.WebGLMU.textureMemoryAmount/(1024*1024);
					var buffUsage = PS.Packet.WebGLMU.buffersMemoryAmount/(1024*1024);
					_guiParams.texturesMemoryUsage = texUsage;
					_guiParams.buffersMemoryUsage  = buffUsage;
					_guiParams.totalMemoryUsage    = texUsage+buffUsage;
				},
				onStartAnimating: function() {
					_startAnimateTime = Date.now();
					_that.metadataViewer.setPlayButtonState("pause");
					if (_options.seadragonEnabled) {
						_that.seadragonViewer.setVisible(false);
					}
					userDefinedViewerOptions.onStartAnimating();
				},
				onStopAnimating: function(nbFramesRendered) {
					if (_startAnimateTime) {
						var duration = Date.now() - _startAnimateTime;
						if (duration > 3000) { //do not log fps stats if animation duration < 3s
							_options.viewer.onLog({type: "Stats", label: "fps", time: duration, nbFrames: nbFramesRendered});
						}
					}
					_that.metadataViewer.setPlayButtonState("play");
					userDefinedViewerOptions.onStopAnimating();
				},
				startDownloadingTiles: function(camera, visible) {
					//if visible = true:  the packet viewer is already resting on the camera pose: just start downloading with seadragon visible
					//if visible = false: the packet viewer is not yet on the target camera, download in background (while keeping seadragon hidden, it will be made visible in onCamera)
					if (_options.seadragonEnabled) {
						if (camera.originalSize.x !== 0) {
							if (_currentCamera !== camera) {

								var seadragonUrl = _that.packetViewer.dataset.getSeadragonRootUrl(camera.iIndex);
								var cropping = _that.packetViewer.getCropping(camera, _that.packetViewer.dataset.path.getPose(camera.qIndex, PS.Packet.ViewMode.Smooth).fov);

								if (_that.seadragonViewer.startLoading(seadragonUrl, camera.originalSize, cropping, function() {
									if (visible) {
										_that.seadragonViewer.setVisible(true);
									}
								})) {
									//only affect _currentCamera to camera if seadragonViewer is enabled (=when all geometry are loaded)
									_currentCamera = camera;
								}
							}
						}
					}
				},
				onCameraChanged: function(camera) {
					if (_options.seadragonEnabled && _that.packetViewer.getCurrentCameraMode() !== PS.Packet.ViewMode.Global) {
						_that.seadragonViewer.setVisible(true);
					}
					userDefinedViewerOptions.onCameraChanged(camera);
				},
				onCameraModeChanged: function(mode) {
					_guiParams.cameraMode = mode;
					if (mode === PS.Packet.ViewMode.Global) {
						_div.style.backgroundColor = "white";
					}
					else {
						_div.style.backgroundColor = _dominantColor;
					}
					userDefinedViewerOptions.onCameraModeChanged(mode);
				},
				onPoseChanged: function(pose) {
					if (_options.seadragonEnabled) {
						_that.seadragonViewer.setVisible(false);
					}
					if (_options.mapEnabled) {
						_that.mapViewer.update(pose);
					}
					userDefinedViewerOptions.onPoseChanged(pose);
				},
				onPositionChanged: function(qIndex, rPose) {
					if (_options.seadragonEnabled) {
						_that.seadragonViewer.setVisible(false);
					}
					if (_options.mapEnabled) {
						_that.mapViewer.update(rPose.pose);
					}
					userDefinedViewerOptions.onPositionChanged(qIndex);
				},
				onLog: function(log) {
					if (_options.loggingEnabled) {
						switch (log.type) {
							case "Error":
							case "Warning":
							case "Info":
								console.log(log.type + ": " + log.message);
							break;
							case "Stats":
								if (log.label === "fps") {
									console.log("Stats: " + log.label + " -> " + log.time + "ms ["+Math.round(10*log.nbFrames*1000/(log.time))/10 + "fps]");
								}
								else {
									console.log("Stats: " + log.label + " -> " + log.time + "ms");
								}
							break;
							default:
								console.log(log);
							break;
						}
					}
					_options.onLog(log);
				}
			});

			_that.packetViewer = new PS.Packet.Viewer(_packetViewerDiv, getPacketUrl(), _options.viewer);

			//Build PS.Seadragon.Viewer
			if (_options.seadragonEnabled) {
				_that.seadragonViewer = new PS.Packet.Seadragon.Viewer(_seadragonViewerDiv, _inputDiv);

				//TODO: do this more cleanly
				_that.packetViewer.seadragonViewer = _that.seadragonViewer;
			}

			//Build PS.Packet.Map.Viewer
			if (_options.mapEnabled) {
				_that.mapViewer = new PS.Packet.Map.Viewer(_mapViewerDiv, _options.map);
			}

			_isLoaded = true;
		}
	}

	this.getAnnotationInfo = function(point, onComplete) {
		if (point.x >= 0 && point.x <= 1.0 && point.y >= 0 && point.y <= 1.0) {
			var dataset    = _that.packetViewer.dataset;
			var geometries = dataset.geometryRanges;

			for (var i=0; i<geometries.length; ++i) {
				var range = dataset.computeRange(i);
				if (_currentCamera.index >= range.start && _currentCamera.index < range.end) {
					var geometryFileIndex = i;
					var cameraFileIndex   = _currentCamera.index - range.start;
					onComplete(point, geometryFileIndex, cameraFileIndex, _currentCamera);

					break;
				}
			}
		}
	};

	this.destroy = function() {

		clearTimeout(_resizeTimer);
		clearTimeout(_resizeTimeout);

		_options.seadragonEnabled = false; //hack to prevent seadragon.startLoading()

		if (_that.packetViewer) {
			_that.packetViewer.destroy();
			_that.packetViewer = null;
		}

		if (_that.seadragonViewer) {
			_that.seadragonViewer.destroy();
			_that.seadragonViewer = null;
		}

		if (_that.metadataViewer) {
			_that.metadataViewer.destroy();
			_that.metadataViewer = null;
		}

		if (_that.mapViewer) {
			_that.mapViewer = null;
		}

		if (_gui) {
			var guiDiv = _gui.domElement.parentNode;
			_gui.destroy();
			_gui = null;
			guiDiv.parentNode.removeChild(guiDiv);
		}

		if (_isLoaded) { //TODO: rename, create new one!
			document.removeEventListener('fullscreenchange',       onFullscreenChange);
			document.removeEventListener('MSFullscreenChange',     onFullscreenChange);
			document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
			document.removeEventListener('mozfullscreenchange',    onFullscreenChange);
			window.removeEventListener('resize', onWindowResize);
		}

		_div.removeChild(_packetPlayerDiv);
		_div.style.backgroundColor = "";
	};

	function build() {

		//Create DOM elements:

		//div.PSPacketPlayer
		//	div.PSPacketViewer
		//		canvas (webgl)
		//	div.PSMetadataViewer
		//		div.license
		//		div.title
		//		div.toolbar
		//		div.progress

		_packetPlayerDiv = document.createElement("div");
		_packetPlayerDiv.setAttribute("class", "PSPacketPlayer");
		_packetPlayerDiv.style.width  = _options.width  + "px";
		_packetPlayerDiv.style.height = _options.height + "px";

		_div.appendChild(_packetPlayerDiv);

		//Test if webgl is enabled
		if (!PS.isWebGLEnabled()) {
			_isLoaded = true;
			_packetPlayerDiv.innerHTML = '<p class="noWebGL">Sorry, <a href="http://get.webgl.org/">WebGL</a> is not supported &nbsp;<span style="font-size: 70px;">:(</span></p>';

			return;
		}

		if (_options.autoLoad) {
			load();
		}
		else {

			new PS.Utils.Request(getPacketUrl()+"0.json", {
				onComplete: function(xhr) {

					//Parsing 0.json to get the dominant color and a good poster image
					var json = JSON.parse(xhr.responseText);

					//Dominant color
					var dominantColors = json.dominant_colors || [[0,0,0]];
					var dominantColor = dominantColors[0];

					//Poster image
					var topology = json.topology;
					var cameras  = json.cameras.sort(function(a, b) { return a.path_index - b.path_index; });

					//Computing nbPoints in the path
					var nbPoints = 1024;
					if ((topology === "spin" || topology === "panorama") && !json.isClosed) {
						nbPoints = cameras[cameras.length-1].path_index + 1;
					}

					//Computing best startTransitionPercent (if not provided)
					var startTransitionPercent = _options.viewer.startTransitionPercent;
					if (_options.viewer.startTransitionPercent === -1) {
						if (topology === "spin" || topology === "panorama") {
							startTransitionPercent = 0.5;
						}
						else {
							startTransitionPercent = 0;
						}
					}

					//Overriding startTransitionPercent if startCameraIndex is provided
					if (_options.viewer.startCameraIndex !== -1) {
						if (_options.viewer.startCameraIndex < cameras.length) {
							var startCamera = cameras[_options.viewer.startCameraIndex];
							startTransitionPercent = startCamera.path_index / (nbPoints-1);
						}
					}

					//Searching for the closest camera to the starting qIndex (path_index)
					var startingQIndex = startTransitionPercent*(nbPoints-1);
					if (json.isClosed) {
						for (var i=0; i<cameras.length; ++i) {
							var dist = Math.abs(cameras[i].path_index - startingQIndex)%nbPoints;
							if (dist > Math.round(nbPoints/2)) {
								dist = nbPoints-dist;
							}
							cameras[i].dist = dist;
						}
					}
					else {
						for (var i=0; i<cameras.length; ++i) {
							cameras[i].dist = Math.abs(cameras[i].path_index - startingQIndex);
						}
					}
					cameras.sort(function(a, b) { return a.dist - b.dist; });
					var startingIndex = cameras[0].index;
					var paddedIndex = (startingIndex < 10) ? "000" + startingIndex : (startingIndex < 100) ? "00" + startingIndex : (startingIndex < 1000) ? "0" + startingIndex : startingIndex;

					//Display a poster and a 'Click to view' button
					var str = "";
					var backgroundColor = 'rgb('+dominantColor[0]+','+dominantColor[1]+','+dominantColor[2]+')';
					var backgroundURL   = _options.embedThumbURL ? _options.embedThumbURL : getPacketUrl()+'l1/img'+paddedIndex+'.jpg';
					str += '<div class="preview" style="width:'+_options.width+'px; height: '+_options.height+'px; background: '+backgroundColor+' url(\''+backgroundURL+'\') no-repeat center; background-size: contain;">';
					str += PS.Packet.Metadata.Viewer.prototype.generateLogoString(_options.metadata.enableLogo, _options.logoURL, _options.logoTarget);
					str += '	<div style="width:'+_options.width+'px; height: '+_options.height+'px; background-color: rgba(0,0,0,0.5)">';
					str += '		<button class="load" alt="Click to view"></button>';
					str += '	</div>';
					str += '</div>';
					_packetPlayerDiv.innerHTML = str;
					var button = _packetPlayerDiv.getElementsByTagName("button")[0];
					button.addEventListener("click", function() {
						var previewDiv = _packetPlayerDiv.getElementsByClassName("preview")[0];
						previewDiv.getElementsByTagName("svg")[0].style.display = "none"; //hide the preview logo as soon as we click
						load(function() {
							previewDiv.style.display = "none"; //only hide the poster image when the webgl canvas is created
						});
					}, false);
				}
			});
		}
	}

	build();
};
