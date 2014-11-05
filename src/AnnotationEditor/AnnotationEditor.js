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

	PS.Packet.Annotation.Editor:
	----------------------------
	This class is responsible for handling the UI of creation/edition/deletion of annotations.

*/

PS.Packet.Annotation.Editor = function(annotationViewer, options) {

	var _options = {
		onLayerVisibilityChange: function() {},
		onAnnotationPublished: function() {},
		onCancel: function() {},
		onSynthConnectionRequested: function() {},
		alwaysUseHeuristic: true
	};
	PS.extend(_options, options);

	var InfoboxSides = {
		Right: 1,
		Left: -1
	};

	var _blackLayer    = document.getElementsByClassName("PSAnnotationEditorLayer")[0];
	var _title         = _blackLayer.getElementsByClassName("title")[0];
	var _preview       = _blackLayer.getElementsByClassName("preview")[0];
	var _exitButton    = _blackLayer.getElementsByClassName("exit")[0];
	var _resizeAnchor  = _preview.getElementsByClassName("anchor")[0];
	var _editPanel     = _preview.getElementsByClassName("editPanel")[0];
	var _textarea      = _preview.getElementsByTagName("textarea")[0];
	var _publishButton = _editPanel.getElementsByClassName("publish")[0];
	var _visPresets    = Array.prototype.slice.call(document.getElementsByName("ps2-visibility-range-type"), 0); //convert to array
	var _visEditButton = _editPanel.getElementsByClassName("edit")[0];
	var _connectButton = _editPanel.getElementsByClassName("connect")[0];
	var _synthUrlInput = _editPanel.getElementsByClassName("synth-url-selector")[0];
	var _cancelButton  = _editPanel.getElementsByClassName("cancel")[0];
	var _saveButton    = _editPanel.getElementsByClassName("publish")[0];
	var _h3s           = _editPanel.getElementsByTagName("h3");

	function cancelBubble(element) {

		//Bad hack for now to make sure the buttons of the toolbar are working
		//If I don't cancelbubbling then the events are captured by the PSInputLayer and not by the buttons

		element.addEventListener("mousedown",  function(e) { e.cancelBubble = true; }, false);
		element.addEventListener("touchstart", function(e) { e.cancelBubble = true; }, false);
		element.addEventListener("touchmove",  function(e) { e.cancelBubble = true; }, false);
		element.addEventListener("touchend",   function(e) { e.cancelBubble = true; }, false);

		element.addEventListener("MSPointerDown",   function(e) { e.cancelBubble = true; }, false);
		element.addEventListener("MSPointerUp",     function(e) { e.cancelBubble = true; }, false);
		element.addEventListener("MSGestureStart",  function(e) { e.cancelBubble = true; }, false);
		element.addEventListener("MSGestureChange", function(e) { e.cancelBubble = true; }, false);
		element.addEventListener("MSGestureEnd",    function(e) { e.cancelBubble = true; }, false);
	}

	_visPresets.forEach(function(elem) {
		cancelBubble(elem);
		elem.addEventListener("click", function(e) {
			e.cancelBubble = true;
			_that.changeVisibility(this.value);
		}, false);

		var label = elem.parentNode;

		cancelBubble(label);
		label.addEventListener("click", function(e) {
			e.cancelBubble = true;
			e.preventDefault();
			_that.changeVisibility(this.getAttribute("value"));
		}, false);

	});

	new PS.Packet.SingleTouchInputHandler(_visEditButton, { //edit visibility range button
		onDown: function(e) {
			_that.changeVisibility('manual');
			e.originalEvent.cancelBubble = true;
			return true;
		}
	});

	new PS.Packet.SingleTouchInputHandler(_h3s[0], { //H3 caption
		onDown: function(e) {
			_that.setMode('caption');
			e.originalEvent.cancelBubble = true;
			return true;
		}
	});

	new PS.Packet.SingleTouchInputHandler(_h3s[1], { //H3 visibility
		onDown: function(e) {
			_that.setMode('visibility');
			e.originalEvent.cancelBubble = true;
			return true;
		}
	});

	new PS.Packet.SingleTouchInputHandler(_h3s[2], { //H3 synth connection
		onDown: function(e) {
			_that.setMode('synth connection');
			e.originalEvent.cancelBubble = true;
			return true;
		}
	});

	_synthUrlInput.addEventListener("change", function() {
		var synthUrl = this.value;
		var isValidUrl = isValidSynthUrl(synthUrl).isValid;
		_connectButton.disabled = !isValidUrl;
	}, false);

	new PS.Packet.SingleTouchInputHandler(_cancelButton, {
		onDown: function(e) {
			_that.cancel();
			e.originalEvent.cancelBubble = true;
			return true;
		}
	});

	new PS.Packet.SingleTouchInputHandler(_saveButton, {
		onDown: function(e) {
			_that.publish();
			e.originalEvent.cancelBubble = true;
			return true;
		}
	});

	new PS.Packet.SingleTouchInputHandler(_connectButton, {
		onDown: function(e) {
			var result = isValidSynthUrl(_synthUrlInput.value);
			var currentAnnotation = _annotationViewer.get(_currentAnnotationId);
			if (result.isValid && currentAnnotation && currentAnnotation.dbid) {
				_options.onSynthConnectionRequested(result.info, currentAnnotation.dbid);
				_that.exit();
			}
			e.originalEvent.cancelBubble = true;
			return true;
		}
	});

	new PS.Packet.SingleTouchInputHandler(_exitButton, {
		onDown: function(e) {
			_that.exit();
			e.originalEvent.cancelBubble = true;
			return true;
		}
	});

	function isValidSynthUrl(url) {

		//TODO: write a Regexp here!
		//Need to test for range of startat + only ps2 guid + support removing /preview in the url + int/prod

		var prefix = 'https://photosynth.net/preview/view/';
		var tmp = url.split('?startat=');
		if (tmp.length === 2) {
			if (tmp[1] !== "") {
				var sIndex = parseInt(tmp[1], 10);

				var guid = tmp[0].replace(prefix, '');
				if (guid.length === 36 && tmp[0].length === prefix.length+36) {

					return {
						isValid: true,
						info: {
							source: {
								sIndex: _annotationViewer.getRaw(_currentAnnotationId).camSIndex
							},
							target: {
								guid: guid,
								sIndex: sIndex
							}
						}
					};
				}
			}
		}
		return {
			isValid: false
		};
	}


	var _annotationViewer  = annotationViewer;
	var _annotationBuilder = new PS.Packet.Annotation.Builder(_options.alwaysUseHeuristic);
	var _visibilityControl = new PS.Packet.Annotation.VisibilityControl({
		onCancel: function(mode) {
			//reset visibility to previous state
			_annotationViewer.setVisibility(_currentAnnotationId, _defaultVisibility);

			resetEditInfoboxState(mode);
		},
		onDone: function(range) {
			//apply new manual visibility information
			_annotationViewer.setVisibility(_currentAnnotationId, range.visibility);

			resetEditInfoboxState(range.mode);
		},
		onRangeChanged: function(range) {
			if (range.mode === PS.Packet.Annotation.VisibilityRangeUpdateMode.Start) {
				_player.packetViewer.setPosition(range.start);
			}
			else if (range.mode === PS.Packet.Annotation.VisibilityRangeUpdateMode.Stop) {
				_player.packetViewer.setPosition(range.stop);
			}
		}
	});

	function resetAnnotationToNotEditableState() {
		//reset the annotation to not editable state
		_annotationViewer.setVisibilityEditable(_currentAnnotationId, false);
		_annotationViewer.setVisible(_currentAnnotationId, false);

		//display the edit infobox while not triggering the onLayerVisibilityChange
		setVisible(true);

		//move the edit infobox
		_listenToMove = true;
		_annotationViewer.onPoseChanged(_player.packetViewer.renderer.getCamera());
	}

	function resetEditInfoboxState(mode) {
		//if the range has changed then we need to move back to go to the keyframe annotation camera
		if (mode !== PS.Packet.Annotation.VisibilityRangeUpdateMode.Init) {
			var annotation = _annotationViewer.getRaw(_currentAnnotationId);
			_player.packetViewer.gotoCamera(_dataset.cameras[annotation.camSIndex], {
				onComplete: function() {
					resetAnnotationToNotEditableState();
				}
			});
		}
		//otherwise we can directly restore the annotation and edit state
		else {
			resetAnnotationToNotEditableState();
		}
	}

	var _player;
	var _that = this;
	var _minRadius = 22;
	var _maxRadius = Math.min(window.innerWidth, window.innerHeight)/2.5;
	var _initRadius = 50;
	var _currentRadius = _initRadius;
	var _previewPosition = new THREE.Vector2();
	var _wasResizeDown = false;
	var _wasMoveDown   = false;
	var _mousePosition = new THREE.Vector2();
	var _currentAnnotationId = -1;
	var _dataset;
	var _position;
	var _defaultVisibility = [];
	var _infoboxSide = InfoboxSides.Right;
	var _currentCamera;
	var _defaultText = "Add your note";
	var _previousAnnotation;
	var _listenToMove = false;

	this.init = function(player) {
		_player  = player;
		_dataset = player.packetViewer.dataset;
		_annotationBuilder.init(player);
		_visibilityControl.init(player);
	};

	this.move = function(annotation, tx, ty) {

		if (_listenToMove) {

			var style = annotation.div.style;
			var radius = parseInt(style.width, 10)/2;

			var x = tx + parseInt(style.left, 10) + radius;
			var y = ty + parseInt(style.top, 10)  + radius;

			_currentRadius = radius;
			_previewPosition.set(x, y);
			_mousePosition.set(x, y);
			_preview.style.display = "block"; //preview needs to be visible before calling updatePreviewRadius
			updatePreviewRadius(radius, false, true);
		}
		_listenToMove = false;

	};

	this.edit = function(annotation, tx, ty) {

		if (annotation.transform) {
			var target = annotation.transform.target;
			_synthUrlInput.value = "https://photosynth.net/preview/view/"+target.guid+"?startat="+target.sIndex;
		}
		else {
			_synthUrlInput.value = "";
		}

		_currentAnnotationId = annotation.id;
		_that.setVisible(true);
		setAddMessageVisible(false);
		_listenToMove = true;
		_that.move(annotation, tx, ty);
		_that.setMode('caption');
		_textarea.value = annotation.text || _defaultText;

		_annotationViewer.setVisible(_currentAnnotationId, false);
		_visibilityControl.setState(_dataset.cameras[annotation.camSIndex], annotation.visibility);
		_defaultVisibility = annotation.visibility;

		_previousAnnotation = _annotationViewer.get(annotation.id);
		setVisibilityPreset(annotation.visibilityPreset);
	};

	this.resize = function() {
		_maxRadius = Math.min(window.innerWidth, window.innerHeight)/2.5;
	};

	this.setPosition = function(qIndex) {
		_position = qIndex;
	};

	this.onCameraChanged = function(cam) {
		_currentCamera = cam;
	};

	this.start = function() {
		_that.setVisible(true);
		setAddMessageVisible(true);
		_that.setMode('caption');
	};

	this.publish = function() {

		var text = _textarea.value;
		if (text !== _defaultText) {
			_annotationViewer.setText(_currentAnnotationId, text);
		}

		_annotationViewer.setVisible(_currentAnnotationId, true);
		_annotationViewer.setEditable(_currentAnnotationId, false);
		var annotation = _annotationViewer.get(_currentAnnotationId);

		var resizeState = _player.packetViewer.resizeState;
		var dimension = Math.min(resizeState.width * resizeState.scale, resizeState.height * resizeState.scale);
		var radius = annotation.radius*dimension;

		var viewport = _player.seadragonViewer.openSeadragon.viewport;

		var scaling = 1.0 / viewport.viewportToImageZoom(viewport.getHomeZoom());
		radius *= scaling;

		var camera = _player.packetViewer.dataset.getCameraByIndex(annotation.imgIndex);

		var originalSize = camera.originalSize;
		var x = annotation.queryPoint[0]*originalSize.x;
		var y = annotation.queryPoint[1]*originalSize.y;

		setPublishButtonText("saving...");
		_publishButton.disabled = true;

		_options.onAnnotationPublished(annotation, _currentAnnotationId, {
			x: x,
			y: y,
			radius: radius
		}, function(succeeded) {
			setPublishButtonText("save");
			_publishButton.disabled = false;

			if (succeeded) {
				hideControls();
			}
		});
	};

	this.exit = function() {
		_that.cancel();
		_that.setVisible(false);
	};

	this.cancel = function() {
		if (_currentAnnotationId !== -1) {
			var annotation = _annotationViewer.get(_currentAnnotationId);
			if (annotation.dbid === "") {
				_annotationViewer.remove(_currentAnnotationId);
			}
			else {
				_annotationViewer.load([_previousAnnotation]);
				_previousAnnotation = null;
			}
		}
		hideControls();
		_options.onCancel();
	};

	this.changeVisibility = function(mode) {

		var annotation = _annotationViewer.getRaw(_currentAnnotationId);

		if (mode === "manual") {
			setVisibilityPreset(PS.Packet.Annotation.VisibilityPreset.Manual);
			if (!_player.seadragonViewer.isHomeZoom()) {
				_player.seadragonViewer.goHome();
			}
			_visibilityControl.setVisibility(annotation.visibility);
			_visibilityControl.setVisible(true);
			_annotationViewer.setVisibility(_currentAnnotationId, _dataset.cameras.map(function(c) { return c.index; }));
			_annotationViewer.setVisible(_currentAnnotationId, true);
			_annotationViewer.setVisibilityEditable(_currentAnnotationId, true);
			setVisible(false); //Important: I'm not calling the public version here but the private one in order to not call onLayerVisibilityChange and display the player toolbar
		}
		else if (mode === "all") {
			setVisibilityPreset(PS.Packet.Annotation.VisibilityPreset.All);
			var visibility = _dataset.cameras.map(function(c) { return c.index; });
			_visibilityControl.setVisibility(visibility);
			_annotationViewer.setVisibility(_currentAnnotationId, visibility);
		}
		else if (mode === "one") {
			setVisibilityPreset(PS.Packet.Annotation.VisibilityPreset.One);
			var visibility = [_dataset.cameras[annotation.camSIndex].index];
			_visibilityControl.setVisibility(visibility);
			_annotationViewer.setVisibility(_currentAnnotationId, visibility);
		}
		else { //if (mode === "auto") {
			setVisibilityPreset(PS.Packet.Annotation.VisibilityPreset.Auto);
			_visibilityControl.setVisibility(_defaultVisibility);
			_annotationViewer.setVisibility(_currentAnnotationId, _defaultVisibility);
		}
	};

	this.setVisible = function(visible) {
		setVisible(visible);
		_player.metadataViewer.setToolbarVisibility(!visible);
		_options.onLayerVisibilityChange(visible);
	};

	this.isVisible = function() {
		return _blackLayer.style.display === "block";
	};

	this.setMode = function(mode) {
		_player.packetViewer.cameraController.blurKeyboardElement();
		var h3s = _editPanel.getElementsByTagName("h3");
		for (var i=0; i<h3s.length; ++i) {
			h3s[i].parentNode.classList.remove("selected");
		}
		for (var i=0; i<h3s.length; ++i) {
			if (h3s[i].innerText === mode || h3s[i].textContent === mode) {
				h3s[i].parentNode.classList.add("selected");
			}
		}
	};

	function setVisibilityPreset(preset) {
		if (preset >= 0 && preset < 4) {
			_visPresets[preset].checked = true;
		}
		else {
			_visPresets[0].checked = true;
		}
		_visEditButton.disabled = preset !== PS.Packet.Annotation.VisibilityPreset.Manual;

		_annotationViewer.setVisibilityPreset(_currentAnnotationId, preset);
	}

	function setVisible(visible) {
		_blackLayer.style.display = visible ? "block" : "none";
	}

	function setPublishButtonText(text) {
		if (_publishButton.innerText) {
			_publishButton.innerText = text;
		}
		else {
			_publishButton.textContent = text;
		}
	}

	function setAddMessageVisible(visible) {
		_title.style.display = visible ? "" : "none";
	}

	function createPreview(x, y, point) {
		//point is expressed in image coordinates [0,1]

		if (_preview.style.display === "block") {
			return;
		}
		setAddMessageVisible(false);

		_currentRadius = _initRadius;
		_previewPosition.set(x, y);
		_preview.style.display = "block";
		updatePreviewRadius(_currentRadius, true, true);

		if (_currentAnnotationId !== -1) {
			_annotationViewer.remove(_currentAnnotationId);
			_currentAnnotationId = -1;
		}

		_player.getAnnotationInfo(point, function(point, geomIndex, camIndex, camera) {
			_annotationBuilder.getPositionAndVisibility(point, geomIndex, camIndex, camera, function(worldPoint, visibility, distCamObject, camSIndex, queryPoint, surfaceOrientation) {
				_currentAnnotationId = _annotationViewer.add(worldPoint, visibility, PS.Packet.Annotation.VisibilityPreset.Auto, distCamObject, camSIndex, queryPoint, surfaceOrientation, false);
				_annotationViewer.setRadius(_currentAnnotationId, _currentRadius);
				_annotationViewer.setEditable(_currentAnnotationId, true);
				_defaultVisibility = visibility;

				var annotation = _annotationViewer.getRaw(_currentAnnotationId);
				_visibilityControl.setState(_dataset.cameras[annotation.camSIndex], annotation.visibility);
			});
		});
	}

	function updatePreviewRadius(radius, updateViewer, updateDraggingDirection) {
		_preview.style.top  = (_previewPosition.y-radius) + "px";
		_preview.style.left = (_previewPosition.x-radius) + "px";
		_preview.style.width = _preview.style.height = (2*radius) + "px";

		var anchorW = 37;
		var anchorH = 38;
		_resizeAnchor.style.top = (radius-anchorH/2) + "px";

		var infoboxWidth   = _editPanel.offsetWidth; //TODO: replace by the hard-coded value in css to avoid reflow?
		var infoboxHeight  = _editPanel.offsetHeight;
		var infoboxHWidth  = infoboxWidth/2;
		var infoboxHHeight = infoboxHeight/2;
		var offsetInfoboxAnchor = 25;

		_editPanel.style.top  = (radius-infoboxHHeight) + "px"; //centered for now

		//position infobox horizontally
		if (_previewPosition.x+radius+offsetInfoboxAnchor+infoboxWidth < window.innerWidth) { //right
			_editPanel.style.left = (2*radius+offsetInfoboxAnchor) +"px";
			_resizeAnchor.style.left = (-anchorW/2-2) + "px";
			if (updateDraggingDirection) {
				_infoboxSide = InfoboxSides.Right;
			}
		}
		else { //left
			_editPanel.style.left = (-offsetInfoboxAnchor-infoboxWidth) +"px";
			_resizeAnchor.style.left = (2*radius-anchorW/2) + "px";
			if (updateDraggingDirection) {
				_infoboxSide = InfoboxSides.Left;
			}
		}

		var topOrBottomCase = false;

		if (_previewPosition.y-infoboxHHeight < 0) {
			//edit panel is above the screen, display it bellow the annotation
			_editPanel.style.top = (2*radius+offsetInfoboxAnchor) +"px";
			topOrBottomCase = true;
		}

		//It's not a 'else if' but 'if' as this will override the above 'if' and make sure the
		//editPanel is displayed above the annotation and thus the cancel button should be visible.
		if (_previewPosition.y+infoboxHHeight > window.innerHeight) {
			//edit panel is bellow the screen, display it above the annotation
			_editPanel.style.top = (-infoboxHeight-offsetInfoboxAnchor) +"px";
			topOrBottomCase = true;
		}

		if (topOrBottomCase) {
			if (_previewPosition.x-infoboxHWidth < 0) {
				//left boundary case
				_editPanel.style.left = radius +"px";
			}
			else if (_previewPosition.x+infoboxHWidth > window.innerWidth) {
				//right boundary case
				_editPanel.style.left = (-infoboxWidth) +"px";
			}
			else {
				//default center
				_editPanel.style.left = radius-infoboxHWidth +"px";
			}
		}

		if (updateViewer) {
			_annotationViewer.setRadius(_currentAnnotationId, radius);
		}
	}

	function updatePreviewPosition() {

		var hoverState = isHoverImagery(_previewPosition.x, _previewPosition.y);
		if (hoverState.hover) {
			_player.getAnnotationInfo(hoverState.point, function(point, geomIndex, camIndex, camera) {
				_annotationBuilder.getPositionAndVisibility(point, geomIndex, camIndex, camera, function(worldPoint, visibility, distCamObject, camSIndex, queryPoint, surfaceOrientation) {

					var annotation = _annotationViewer.get(_currentAnnotationId);
					_annotationViewer.remove(_currentAnnotationId);

					_currentAnnotationId = _annotationViewer.add(worldPoint, visibility, PS.Packet.Annotation.VisibilityPreset.Auto, distCamObject, camSIndex, queryPoint, surfaceOrientation, false);
					_annotationViewer.setRadius(_currentAnnotationId, _currentRadius);
					_annotationViewer.setEditable(_currentAnnotationId, true);
					_annotationViewer.setText(_currentAnnotationId, annotation.text);
					_annotationViewer.setPersistentId(_currentAnnotationId, annotation.dbid);

					_defaultVisibility = visibility;
				});
			});
		}
	}

	function hideControls() {
		_currentAnnotationId = -1;
		_player.packetViewer.cameraController.focusKeyboardElement();
		_that.setVisible(false);
		_preview.style.display = "none";
		_that.setMode('caption');
		_textarea.value = _defaultText;
		_infoboxSide = InfoboxSides.Right;
		setVisibilityPreset(PS.Packet.Annotation.VisibilityPreset.Auto);
	}

	function isHoverImagery(clientX, clientY) {
		var viewport = _player.seadragonViewer.openSeadragon.viewport;

		if (viewport) {
			var point = _player.seadragonViewer.windowToImageCoordinates(clientX, clientY);
			var contentSize = viewport.contentSize;
			point.x /= contentSize.x;
			point.y /= contentSize.y;
			if (point.x >= 0 && point.x <= 1.0 && point.y >= 0 && point.y <= 1.0) {
				return {
					hover: true,
					point: point
				};
			}
		}
		return {
			hover: false
		};
	}

	//change cursor from crosshair to default depending if the cursor is above imagery
	var blackLayerCursorStyle = "default";
	_blackLayer.addEventListener("mousemove", function(e) {
		var hoverState = isHoverImagery(e.clientX, e.clientY);
		if (hoverState.hover) {
			if (_currentAnnotationId !== -1 && blackLayerCursorStyle !== "default") {
				blackLayerCursorStyle = _blackLayer.style.cursor = "default";
			}
			else if (_currentAnnotationId === -1 && blackLayerCursorStyle !== "crosshair") {
				blackLayerCursorStyle = _blackLayer.style.cursor = "crosshair";
			}
		}
		else {
			if (blackLayerCursorStyle !== "default") {
				blackLayerCursorStyle = _blackLayer.style.cursor = "default";
			}
		}
	}, false);

	//create a preview when clicking on the editing layer (and if above imagery)
	new PS.Packet.SingleTouchInputHandler(_blackLayer, {
		onDown: function(e) {
			if (e.originalEvent.target === _blackLayer && !_wasResizeDown) {
				var hoverState = isHoverImagery(e.clientX, e.clientY);
				if (hoverState.hover) {
					createPreview(e.layerX, e.layerY, hoverState.point);
					e.originalEvent.cancelBubble = true;
					return true;
				}
			}
			return false;
		}
	});

	//resize the current annotation while dragging horizontally the resize anchor
	new PS.Packet.SingleTouchInputHandler(_resizeAnchor, {
		onDown: function(e) {
			_wasResizeDown = true;
			_mousePosition.set(e.screenX, e.screenY);

			e.originalEvent.cancelBubble = true;
			return true;
		},
		onMove: function(e) {
			var delta = _mousePosition.x-e.screenX;
			delta *= _infoboxSide;
			updatePreviewRadius(Math.max(_minRadius, Math.min(_maxRadius, _currentRadius+delta)), true, false);

			e.originalEvent.cancelBubble = true;
			return true;
		},
		onUp: function(e) {
			var delta = _mousePosition.x-e.screenX;
			delta *= _infoboxSide;
			updatePreviewRadius(Math.max(_minRadius, Math.min(_maxRadius, _currentRadius+delta)), true, true);
			_wasResizeDown = false;
			_currentRadius += delta;

			return true;
		}
	});

	//move the annotation while dragging the preview
	new PS.Packet.SingleTouchInputHandler(_preview, {
		onDown: function(e) {
			var target = e.originalEvent.target;
			if (target && target === _preview) {
				_preview.classList.add("previewMoving");
				_wasMoveDown = true;
				e.originalEvent.cancelBubble = true;
				return true;
			}
			else {
				_wasMoveDown = false;
				return false;
			}
		},
		onMove: function(e) {
			if (_wasMoveDown) {
				var hoverState = isHoverImagery(e.clientX, e.clientY);
				if (hoverState.hover) {
					_previewPosition.set(e.clientX, e.clientY);
					updatePreviewRadius(Math.max(_minRadius, Math.min(_maxRadius, _currentRadius)), true, false);
					e.originalEvent.cancelBubble = true;
					return true;
				}
			}
			return false;
		},
		onUp: function(e) {
			if (_wasMoveDown) {
				var hoverState = isHoverImagery(e.clientX, e.clientY);
				if (hoverState.hover) {
					_previewPosition.set(e.clientX, e.clientY);
				}
				updatePreviewPosition();
				updatePreviewRadius(Math.max(_minRadius, Math.min(_maxRadius, _currentRadius)), true, true);
			}

			_wasMoveDown = false;
			_preview.classList.remove("previewMoving");

			return true;
		}
	});

	//textarea handling
	cancelBubble(_textarea);
	_textarea.addEventListener("click", function() {
		if (this.value === _defaultText) {
			this.value = "";
		}
	}, false);

	_textarea.addEventListener("blur", function() {
		if (this.value === "") {
			this.value = _defaultText;
		}
	}, false);

	_textarea.addEventListener("change", function() {
		var text = this.value;
		if (text !== _defaultText) {
			_annotationViewer.setText(_currentAnnotationId, text);
		}
	}, false);

};
