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

Photosynth.PS2Viewer = function(element, options) {

	var _options = {
		width: -1,
		height: -1,
		animateSpeed: 1.0,
		presetGPU: PS.Packet.PresetGPU.Laptop,
		autoStart: true,
		autoLoad: true,
		loggingEnabled: false,
		annotateEnabled: false,
		pathToWorker: "",
		autoResizeEnabled: false,
		hiddenMenuEnabled: false,
		debugMenuEnabled:  false
	};
	PS.extend(_options, options);

	if (_options.width === -1 || _options.width === 0) {
		_options.width = element.offsetWidth || 800;
	}

	if (_options.height === -1 || _options.height === 0) {
		_options.height = element.offsetHeight || 500;
	}

	if (_options.pathToWorker === "") {
		console.warn("You need to provide the pathToWorker as an option");
	}

	var _domCreated = false;
	var _element = element;
	var _player;
	var _playerInitialized = false;
	var _that = this;

	var _eventDispatcher = new Photosynth.PlayerEventDispatcher();

	this.addEventListener = function(eventName, callback) {
		_eventDispatcher.addEventListener(eventName, callback);
	};

	this.removeEventListener = function(eventName, callback) {
		_eventDispatcher.removeEventListener(eventName, callback);
	};

	this.loadGuid = function(guid, options) {
		PS.API.getPS2Url(guid, function(url) {
			if (url) {
				_that.load(url, options);
			}
			else {
				console.error("'" + guid + "' is not a valid guid");
			}
		});
	};

	this.load = function(url, options) {

		_playerInitialized = false;

		if (!_domCreated) {
			buildPlayer(url, options);
		}
		else {
			_player.load(url, options);
		}
	};

	this.preload = function(url, onPreloaded) {
		_player.preload(url, onPreloaded);
	};

	this.setActiveDataset = function(dataset) {
		_player.setActiveDataset(dataset);
	};

	this.setCameraMode = function(mode) {
		//TODO: check mode with whitelist from PS.Packet.CameraMode
		if (_playerInitialized) {
			_player.setCameraMode(mode);
		}
	};

	this.getCameraMode = function() {
		if (_player && _player.packetViewer) {
			return _player.packetViewer.getCurrentCameraMode();
		}
		else {
			return PS.Packet.ViewMode.Smooth;
		}
	};

	this.setPosition = function(qIndex) {
		if (_playerInitialized) {
			_player.packetViewer.setPosition(qIndex);
		}
	};

	this.setAnimationSpeed = function(speed) {
		if (_playerInitialized) {
			_player.packetViewer.setOptions({animateSpeed: _player.packetViewer.getOptions().animateSpeed*speed});
		}
	};

	this.isPlaying = function() {
		if (_playerInitialized) {
			return _player.packetViewer.isPlaying();
		}
		else {
			return false;
		}
	};

	this.togglePlay = function(options) {
		var defaultOptions = {
			direction: null, // null or 1 or -1 (null = respectDraggingDirection, default behaviour)
			onStopped: null  // null or function
		};
		defaultOptions = PS.extend(defaultOptions, options);

		//check for input validity
		defaultOptions.direction = defaultOptions.direction === -1 ? -1 : defaultOptions.direction === 1 ? 1 : null;
		defaultOptions.onStopped = typeof defaultOptions.onStopped === "function" ? defaultOptions.onStopped : null;

		if (_playerInitialized) {

			if (_player.packetViewer.isPlaying()) {
				//stop
				_player.packetViewer.stopPlaying(defaultOptions.onStopped);
			}
			else {
				//play
				if (!_player.seadragonViewer.isHomeZoom()) {
					_player.seadragonViewer.goHome();
				}
				_player.packetViewer.startPlaying(defaultOptions.direction);
			}
		}
	};

	this.play = function(direction) {
		if (!_that.isPlaying()) {
			_that.togglePlay({direction: direction});
		}
	};

	this.stop = function(onStopped) {
		if (_that.isPlaying()) {
			_that.togglePlay({onStopped: onStopped});
		}
	};

	this.gotoCamera = function(camera, options) {
		//TODO: check input validity
		_player.packetViewer.gotoCamera(camera, options);
	};

	this.isHomeZoom = function() {
		if (_player && _player.seadragonViewer) {
			return _player.seadragonViewer.isHomeZoom();
		}
		else {
			return true;
		}
	};

	this.goHomeZoom = function() {
		if (_player && _player.seadragonViewer) {
			_player.seadragonViewer.goHome();
		}
	};

	this.getInternal = function() {
		return _player;
	};

	this.blur = function() {
		if (_player && _player.packetViewer && _player.packetViewer.cameraController) {
			_player.packetViewer.cameraController.blurKeyboardElement();
		}
	};

	this.focus = function() {
		if (_player && _player.packetViewer && _player.packetViewer.cameraController) {
			_player.packetViewer.cameraController.focusKeyboardElement();
		}
	};

	this.resize = function(width, height, mode) {
		_player.resize(width, height, mode ? mode : PS.Packet.ResizeMode.Slow);
	};

	this.dispose = function() {
		if (_player) {
			_player.destroy();
			_player = null;
		}
	};

	function buildPlayer(url, options) {

		var opts = {
			startCameraIndex: -1
		};
		PS.extend(opts, options);

		var playerOptions = {
			width: _options.width,
			height: _options.height,
			autoLoad: _options.autoLoad,
			autoResizeEnabled: _options.autoResizeEnabled,
			debugMenuEnabled: _options.debugMenuEnabled,
			packetURL: url,
			corsEnabled: true,
			loggingEnabled: _options.loggingEnabled,
			onToggleFullscreen: function(fullscreen) {
				_eventDispatcher.callbacks.onToggleFullscreen(fullscreen);
			},
			viewer: {
				startCameraIndex: opts.startCameraIndex,
				pathToWorker: _options.pathToWorker,
				presetGPU: _options.presetGPU,
				autoStartEnabled: _options.autoStart,
				renderer: {
					screenshotEnabled: _options.screenshotEnabled
				},
				onCameraChanged: function(cam) {
					_eventDispatcher.callbacks.onCameraChanged(cam);
				},
				onCamerasChanged: function(a, b) {
					_eventDispatcher.callbacks.onCamerasChanged(a, b);
				},
				onCanvasCreated: function() {
					_playerInitialized = true;
					_eventDispatcher.callbacks.onCanvasCreated();
				},
				onCanvasUpdated: function() {
					_eventDispatcher.callbacks.onCanvasUpdated();

					if (_options.animateSpeed !== 1) {
						_player.packetViewer.setOptions({animateSpeed: _player.packetViewer.getOptions().animateSpeed*_options.animateSpeed});
					}
				},
				onDatasetLoaded: function(dataset) {
					_eventDispatcher.callbacks.onDatasetLoaded(dataset);
				},
				onDatasetRendered: function(dataset) {
					_eventDispatcher.callbacks.onDatasetRendered(dataset);
				},
				onStartAnimating: function() {
					_eventDispatcher.callbacks.onStartAnimating();
				},
				onStopAnimating: function() {
					_eventDispatcher.callbacks.onStopAnimating();
				},
				onCameraModeChanged: function(mode) {
					_eventDispatcher.callbacks.onCameraModeChanged(mode);
				},
				onPoseChanged: function() {
					_eventDispatcher.callbacks.onPoseChanged();
				},
				onPositionChanged: function(qIndex) {
					_eventDispatcher.callbacks.onPositionChanged(qIndex);
				},
				onAllGeometryLoaded: function() {
					_eventDispatcher.callbacks.onAllGeometryLoaded();
				},
				onAllHDLoaded: function() {
					_eventDispatcher.callbacks.onAllHDLoaded();
				},
				onContainerTransformed: function(tx, ty, scale) {
					_eventDispatcher.callbacks.onContainerTransformed(tx, ty, scale);
				},
				onResize: function(resizeState, mode) {
					_eventDispatcher.callbacks.onResize(resizeState, mode);
				}
			},
			seadragonViewer: {
				onResize: function() {
					_eventDispatcher.callbacks.onSeadragonResize();
				},
				onZoomLevelStateChanged: function(isHomeZoom) {
					_eventDispatcher.callbacks.onZoomLevelStateChanged(isHomeZoom);
				}
			},
			metadata: {
				enableAnnotate: _options.annotateEnabled,
				onAnnotate: function() {
					_player.packetViewer.stopPlaying();
					_eventDispatcher.callbacks.onAnnotate();
				}
			}
		};

		if (_options.presetGPU === PS.Packet.PresetGPU.Custom) {
			if (_options.maxRenderSize && _options.maxHDPixels && _options.gpuHDMemoryBudget && _options.maxRenderSize > 0 && _options.maxHDPixels > 0 && _options.gpuHDMemoryBudget > 0) {
				PS.extend(playerOptions, {
					viewer: {
						maxRenderSize:     _options.maxRenderSize,
						maxHDPixels:       _options.maxHDPixels,
						gpuHDMemoryBudget: _options.gpuHDMemoryBudget,
					}
				});
			}
			else {
				console.log("PresetGPU.Custom selected but 'maxRenderSize' or 'maxHDPixels' or 'gpuHDMemoryBudget' are missing or invalid (defaulting to PresetGPU.Laptop)");
				PS.extend(playerOptions, {
					viewer: {
						presetGPU: PS.Packet.PresetGPU.Laptop
					}
				});
			}
		}

		if (_options.debugMenuEnabled) {
			//I'm not sure if it's a good idea as it's probably going to override the rendering settings...
			//TODO: figure out if I should override the options just before checking the rendering options...
			PS.extend(playerOptions, PS.Packet.ViewerOptions.getUser());
		}

		_player = new PS.Packet.Player(_element, playerOptions);
		_domCreated = true;
	}
};
