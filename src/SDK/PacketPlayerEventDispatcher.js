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

Photosynth.PlayerEventDispatcher = function() {

	var _that = new Photosynth.EventDispatcher([
		"viewer-built",
		"viewer-updated",
		"camera-changed",
		"cameras-changed",
		"position-changed",
		"pose-changed",
		"dataset-loaded",
		"dataset-rendered",
		"geometry-loaded",
		"imagery-loaded",
		"animation-start",
		"animation-stop",
		"enter-fullscreen",
		"exit-fullscreen",
		"camera-mode-changed",
		"zoom-level-changed",
		"resize",
		"seadragon-resize",
		"container-transformed",
		"annotate"
	]);

	_that.callbacks = {
		onCanvasCreated: function() {
			_that.fireCallbacks("viewer-built", _that.toArray(arguments));
		},
		onCanvasUpdated: function() {
			_that.fireCallbacks("viewer-updated", _that.toArray(arguments));
		},
		onAllHDLoaded: function() {
			_that.fireCallbacks("imagery-loaded", _that.toArray(arguments));
		},
		onAllGeometryLoaded: function() {
			_that.fireCallbacks("geometry-loaded", _that.toArray(arguments));
		},
		onCameraModeChanged: function() {
			_that.fireCallbacks("camera-mode-changed", _that.toArray(arguments));
		},
		onCameraChanged: function(camera) {
			_that.fireCallbacks("camera-changed", [camera, camera.sIndex]);
		},
		onCamerasChanged: function() {
			_that.fireCallbacks("cameras-changed", _that.toArray(arguments));
		},
		onPositionChanged: function() {
			_that.fireCallbacks("position-changed", _that.toArray(arguments));
		},
		onPoseChanged: function() {
			_that.fireCallbacks("pose-changed");
		},
		onDatasetLoaded: function() {
			_that.fireCallbacks("dataset-loaded", _that.toArray(arguments));
		},
		onDatasetRendered: function() {
			_that.fireCallbacks("dataset-rendered", _that.toArray(arguments));
		},
		onStartAnimating: function() {
			_that.fireCallbacks("animation-start", _that.toArray(arguments));
		},
		onStopAnimating: function() {
			_that.fireCallbacks("animation-stop", _that.toArray(arguments));
		},
		onToggleFullscreen: function(fullscreen) {
			if (fullscreen) {
				_that.fireCallbacks("enter-fullscreen");
			}
			else {
				_that.fireCallbacks("exit-fullscreen");
			}
		},
		onZoomLevelStateChanged: function() {
			_that.fireCallbacks("zoom-level-changed", _that.toArray(arguments));
		},
		onResize: function() {
			_that.fireCallbacks("resize", _that.toArray(arguments));
		},
		onContainerTransformed: function() {
			_that.fireCallbacks("container-transformed", _that.toArray(arguments));
		},
		onSeadragonResize: function() {
			_that.fireCallbacks("seadragon-resize");
		},
		onAnnotate: function() {
			_that.fireCallbacks("annotate");
		}
	};
	return _that;
};
