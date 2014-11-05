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

	PS.Packet.Annotation.VisibilityControl:
	---------------------------------------
	This class is responsible for handling the UI used to define manually the begin and end of the visibility range of an annotation

*/

PS.Packet.Annotation.VisibilityRangeUpdateMode = {
	Init:  0,
	Start: 1,
	Stop:  2
};

PS.Packet.Annotation.VisibilityControl = function(options) {

	var _options = {
		onCancel: function() {},
		onDone: function() {},
		onRangeChanged: function() {}
	};
	PS.extend(_options, options);

	var _layer       = document.getElementsByClassName("PSAnnotationVisibilityLayer")[0];
	var _toolbar     = _layer.getElementsByClassName("toolbar")[0];
	var _handleStart = _toolbar.getElementsByClassName("slider-start")[0];
	var _handleStop  = _toolbar.getElementsByClassName("slider-stop")[0];
	var _divKeyframe = _toolbar.getElementsByClassName("slider-keyframe")[0];
	var _divRange    = _toolbar.getElementsByClassName("slider-range")[0];
	var _cancel      = _toolbar.getElementsByClassName("cancel")[0];
	var _done        = _toolbar.getElementsByClassName("done")[0];

	var _width = 530;
	var _handleWidth = 20;

	var _player;
	var _dataset;
	var _keyframe;
	var _that = this;

	var _startVisibility;
	var _stopVisibility;
	var _lastUpdateRangeMode = PS.Packet.Annotation.VisibilityRangeUpdateMode.Init;

	this.init = function(player) {
		_player   = player;
		_dataset  = player.packetViewer.dataset;
	};

	this.setVisible = function(visible) {
		_layer.style.display = visible ? "block" : "none";
	};

	this.setState = function(keyframeCamera, visibleCameras) {
		_keyframe = keyframeCamera;
		_that.setVisibility(visibleCameras);
		_keyframeDivPosition = pathToPixel(_keyframe.qIndex);
		_divKeyframe.style.left = _keyframeDivPosition+"px";
	};

	this.setVisibility = function(visibleCameras) {
		var cameras = _dataset.cameras;
		var range = [];
		for (var i=0; i<visibleCameras.length; ++i) {
			var index = visibleCameras[i];
			for (var j=0; j<cameras.length; ++j) {
				if (cameras[j].index === index) {
					range.push(cameras[j].qIndex);
					break;
				}
			}
		}
		//why not use dataset.getCameraByIndex? (I think it was not there back then and this method is tolerant to bad input

		var min = range.reduce(function(a, b) {return Math.min(a,b); }); //min qIndex of visible cameras
		var max = range.reduce(function(a, b) {return Math.max(a,b); }); //max qIndex of visible cameras

		var path = _dataset.path;
		if (path.isClosed) {

			//first create an array of boolean showing if the camera is selected or not
			//example: 0000011111111111111111111111110000 (cameras are sorted by qIndex)
			var areCamerasSelected = new Array(cameras.length);
			for (var i=0; i<cameras.length; ++i) {
				var isSelected = visibleCameras.indexOf(cameras[i].index) !== -1;
				areCamerasSelected[i] = isSelected;
			}

			var isFirstCameraSelected = areCamerasSelected[0];
			var isLastCameraSelected  = areCamerasSelected[cameras.length-1];

			if (isFirstCameraSelected && isLastCameraSelected) {
				if (cameras.length === visibleCameras.length) {
					//case: 1111111111111111111111111111111 (all cameras selected)
					_startVisibility = pixelToPath(0);
					_stopVisibility  = pixelToPath(_width-1);
				}
				else {
					//case: 1111110000000000000000001111111 (boundary case)
					_startVisibility = -1;
					_stopVisibility  = -1;

					for (var i=1; i<cameras.length; ++i) {
						if (!areCamerasSelected[i]) {
							_stopVisibility = cameras[i-1].qIndex;
							break;
						}
					}

					for (var i=cameras.length-2; i>0; --i) {
						if (!areCamerasSelected[i]) {
							_startVisibility = cameras[i+1].qIndex;
							break;
						}
					}

					if (_startVisibility === -1 || _stopVisibility === -1) {
						console.log("Error while setting visibility range");
						_startVisibility = min;
						_stopVisibility  = max;
					}
				}
			}
			else {
				//case: 0000011111111111111111111111110000 (normal cases)
				//case: 1111111111111111111111111111000000
				//case: 0000001111111111111111111111111111
				_startVisibility = min;
				_stopVisibility  = max;
			}
		}
		else {
			_startVisibility = min;
			_stopVisibility  = max;
		}

		update(PS.Packet.Annotation.VisibilityRangeUpdateMode.Init);
	};

	function update(updateRangeMode) {
		//need to update start, stop

		var startX = pathToPixel(_startVisibility);
		var stopX  = pathToPixel(_stopVisibility);

		_handleStart.style.left = (startX-_handleWidth)+"px";
		_handleStop.style.left  = (stopX)+"px";
		updateRange(updateRangeMode);
	}

	function updateRange(updateRangeMode) {
		var startX = parseInt(_handleStart.style.left, 10) + _handleWidth;
		var stopX  = parseInt(_handleStop.style.left, 10);

		_divRange.style.left  = (startX)+"px";
		_divRange.style.width = (stopX-startX)+"px";

		if (updateRangeMode !== PS.Packet.Annotation.VisibilityRangeUpdateMode.Init) {
			_startVisibility = pixelToPath(startX);
			_stopVisibility  = pixelToPath(stopX);
			_options.onRangeChanged({
				start:      _startVisibility,
				stop:       _stopVisibility,
				visibility: getVisibleCameras(),
				mode:       updateRangeMode
			});
		}
		_lastUpdateRangeMode = updateRangeMode;
	}

	function getVisibleCameras() {
		var visibility = [];
		var cameras = _dataset.cameras;

		if (_dataset.path.isClosed && _startVisibility > _stopVisibility) {
			//boundary case of closed path
			for (var i=0; i<cameras.length; ++i) {
				var camQIndex = cameras[i].qIndex;
				if (camQIndex >= _startVisibility || camQIndex <= _stopVisibility) {
					visibility.push(cameras[i].index);
				}
			}
		}
		else {
			//normal case
			for (var i=0; i<cameras.length; ++i) {
				var camQIndex = cameras[i].qIndex;
				if (camQIndex >= _startVisibility && camQIndex <= _stopVisibility) {
					visibility.push(cameras[i].index);
				}
			}
		}

		if (visibility.length === 0) {
			visibility.push(_keyframe.index);
		}

		return visibility;
	}

	function pathToPixel(qIndex) {
		var path = _dataset.path;
		if (path.isClosed && _keyframe) {
			var centerOffset = (_keyframe.qIndex/path.nbPoints)*_width;
			var regularX = (qIndex/path.nbPoints)*_width;

			return (regularX-centerOffset+_width/2+_width)%_width;
		}
		else {
			return (qIndex/path.nbPoints)*_width;
		}
	}

	function pixelToPath(px) {
		var path = _dataset.path;
		if (path.isClosed && _keyframe) {
			var halfPathLength = path.nbPoints/2;
			var start = path.fixRange(_keyframe.qIndex - halfPathLength);

			return path.fixRange(start + (px/_width)*path.nbPoints);
		}
		else {
			return (px/_width)*path.nbPoints;
		}
	}

	_cancel.addEventListener("click", function() {
		_that.setVisible(false);
		_options.onCancel(_lastUpdateRangeMode);
	}, false);

	_done.addEventListener("click", function() {
		_that.setVisible(false);
		_options.onDone({
			mode:       _lastUpdateRangeMode,
			visibility: getVisibleCameras()
		});
	}, false);

	var _keyframeDivPosition;

	//Start visibility handle
	var _startHandleClickPosition;
	var _startHandleDivPosition;
	new PS.Packet.SingleTouchInputHandler(_handleStart, {
		onDown: function(e) {
			_startHandleClickPosition = e.clientX;
			_startHandleDivPosition = parseInt(_handleStart.style.left, 10)+_handleWidth;
			return true;
		},
		onMove: function(e) {
			var delta = e.clientX-_startHandleClickPosition;
			var x = _startHandleDivPosition + delta;
			x = Math.max(0, Math.min(_keyframeDivPosition, x));
			_handleStart.style.left = (x-_handleWidth)+"px";
			updateRange(PS.Packet.Annotation.VisibilityRangeUpdateMode.Start);
			return true;
		},
		onUp: function(e) {
			var delta = e.clientX-_startHandleClickPosition;
			var x = _startHandleDivPosition + delta;
			x = Math.max(0, Math.min(_keyframeDivPosition, x));
			_handleStart.style.left = (x-_handleWidth)+"px";
			updateRange(PS.Packet.Annotation.VisibilityRangeUpdateMode.Start);
			return true;
		}
	});

	//Stop visibility handle
	var _stopHandleClickPosition;
	var _stopHandleDivPosition;
	new PS.Packet.SingleTouchInputHandler(_handleStop, {
		onDown: function(e) {
			_stopHandleClickPosition = e.clientX;
			_stopHandleDivPosition = parseInt(_handleStop.style.left, 10);
			return true;
		},
		onMove: function(e) {
			var delta = e.clientX-_stopHandleClickPosition;
			var x = _stopHandleDivPosition + delta;
			x = Math.min(_width, Math.max(_keyframeDivPosition, x));
			_handleStop.style.left = x+"px";
			updateRange(PS.Packet.Annotation.VisibilityRangeUpdateMode.Stop);
			return true;
		},
		onUp: function(e) {
			var delta = e.clientX-_stopHandleClickPosition;
			var x = _stopHandleDivPosition + delta;
			x = Math.min(_width, Math.max(_keyframeDivPosition, x));
			_handleStop.style.left = x+"px";
			updateRange(PS.Packet.Annotation.VisibilityRangeUpdateMode.Stop);
			return true;
		}
	});

};
