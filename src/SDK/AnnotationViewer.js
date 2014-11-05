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

Photosynth.PS2AnnotationViewer = function(viewer, options) {

	var _options = {
		editEnabled: false,
		visibleInFullscreen: false
	};
	PS.extend(_options, options);

	var _viewer = viewer;
	var _internalPlayer; //TODO: get rid of this!!!
	var _that = this;

	var _eventDispatcher = new Photosynth.AnnotationViewerEventDispatcher();

	this.addEventListener = function(eventName, callback) {
		_eventDispatcher.addEventListener(eventName, callback);
	};

	this.removeEventListener = function(eventName, callback) {
		_eventDispatcher.removeEventListener(eventName, callback);
	};

	var _annotationViewer = new PS.Packet.Annotation.Viewer({
		editEnabled: _options.editEnabled,
		onInitialized: function() {
			_eventDispatcher.callbacks.onInit(_that);
		},
		onAnnotationClick: function(annotation, restingCamera) {

			if (_eventDispatcher.callbacks.onAnnotationClick(annotation, restingCamera)) {

				var annotationCamera = _internalPlayer.packetViewer.dataset.cameras[annotation.camSIndex];

				if (_viewer.isPlaying()) {
					_viewer.togglePlay();
				}

				if (restingCamera === annotationCamera) {
					zoomToAnnotation(annotation);
				}
				else if (_viewer.isHomeZoom()) {
					_viewer.gotoCamera(annotationCamera, {
						onComplete: function() {
							zoomToAnnotation(annotation);
						}
					});
				}
				else {
					_viewer.goHomeZoom();
					setTimeout(function() {
						_viewer.gotoCamera(annotationCamera, {
							onComplete: function() {
								zoomToAnnotation(annotation);
							}
						});
					}, 300);
				}
			}
		},
		onAnnotationEdit: function(annotation, tx, ty) {
			_eventDispatcher.callbacks.onAnnotationEdit(annotation, tx, ty);
		},
		onAnnotationDelete: function(annotation) {
			_eventDispatcher.callbacks.onAnnotationDelete(annotation);
		},
		onEditedAnnotationMove: function(annotation, tx, ty) {
			_eventDispatcher.callbacks.onEditedAnnotationMove(annotation, tx, ty);
		}
	});

	function zoomToAnnotation(annotation) {

		_internalPlayer.packetViewer.cameraController.forceInputMode(0);

		var viewport = _internalPlayer.seadragonViewer.openSeadragon.viewport;

		var scaling = 1.0 / viewport.viewportToImageZoom(viewport.getZoom());
		var radius  = annotation.accurateRadius*scaling;

		var contentSize = viewport.contentSize;
		var center      = new THREE.Vector2(contentSize.x*annotation.queryPoint.x, contentSize.y*annotation.queryPoint.y);

		var bounds = viewport.imageToViewportRectangle(new OpenSeadragon.Rect(center.x-radius, center.y-radius, radius*2, radius*2));
		_internalPlayer.seadragonViewer.fitBoundsWithConstraints(bounds, false);
	}

	this.load = function(annotations) {
		_annotationViewer.load(annotations);
	};

	this.clear = function() {
		_annotationViewer.clear();
	};

	this.getInternal = function() {
		return _annotationViewer;
	};

	_viewer.addEventListener("enter-fullscreen", function() {
		if (!_options.visibleInFullscreen) {
			_annotationViewer.setFullscreenState(true);
		}
	});
	_viewer.addEventListener("exit-fullscreen", function() {
		if (!_options.visibleInFullscreen) {
			_annotationViewer.setFullscreenState(false);
		}
	});
	_viewer.addEventListener("viewer-updated", function() {
		_internalPlayer = _viewer.getInternal();

		_annotationViewer.init(_internalPlayer);
		_annotationViewer.setLayerVisibility(false);
	});
	_viewer.addEventListener("geometry-loaded", function() {
		_annotationViewer.setLayerVisibility(true);
	});
	_viewer.addEventListener("camera-changed", function(cam) {
		_annotationViewer.onCameraChanged(cam);
	});
	_viewer.addEventListener("cameras-changed", function(a, b) {
		_annotationViewer.onCamerasChanged(a, b);
	});
	_viewer.addEventListener("position-changed", function() {
		_annotationViewer.onPoseChanged(_internalPlayer.packetViewer.renderer.getCamera());
	});
	_viewer.addEventListener("pose-changed", function() {
		_annotationViewer.onPoseChanged(_internalPlayer.packetViewer.renderer.getCamera());
	});
	_viewer.addEventListener("container-transformed", function(tx, ty, scale) {
		_annotationViewer.setTransform(tx, ty, scale);
	});
	_viewer.addEventListener("resize", function(resizeState, mode) {
		_annotationViewer.resize(resizeState, mode);
	});
	_viewer.addEventListener("camera-mode-changed", function(mode) {
		if (mode === PS.Packet.CameraMode.Global) {
			_annotationViewer.setLayerVisibility(false);
		}
		else {
			_annotationViewer.setLayerVisibility(true);
			_annotationViewer.onPoseChanged(_internalPlayer.packetViewer.renderer.getCamera());
		}
	});
	_viewer.addEventListener("seadragon-resize", function() {
		_annotationViewer.onPoseChanged(_internalPlayer.packetViewer.renderer.getCamera());
	});
};
