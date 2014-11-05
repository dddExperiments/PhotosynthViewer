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

	PS.Packet.Annotation.Viewer:
	----------------------------
	This class is responsible for handling the UI of annotation viewing.
	Annotations are rendered as div with border-radius 50% to create circles

*/

PS.Packet.Annotation = {};

PS.Packet.Annotation.VisibilityPreset = {
	Auto:   0,
	All:    1,
	One:    2,
	Manual: 3
};

PS.Packet.Annotation.Viewer = function(options) {

	function Annotation(worldPoint, visibility, visibilityPreset, surfaceOrientation, distCamObject, camSIndex, queryPoint, div, id) {
		this.worldPoint = worldPoint;
		this.visibility = visibility;
		this.visibilityPreset = visibilityPreset;
		this.surfaceOrientation = surfaceOrientation;
		this.radius = 42; //in px
		this.accurateRadius = 42;
		this.distCamObject = distCamObject;

		this.queryPoint = queryPoint;
		this.camSIndex  = camSIndex;
		this.div = div;
		this.id  = id;
		this.text = "";
		this.dbid = "";
	}

	var _options = {
		editEnabled: false,
		onInitialized:      function() {},
		onAnnotationClick:  function() {},
		onAnnotationEdit:   function() {},
		onAnnotationDelete: function() {},
		onEditedAnnotationMove: function() {}
	};
	PS.extend(_options, options);

	var _player;
	var _annotations = [];
	var _domCreated = false;
	var _projectionMatrix = new THREE.Matrix4();
	var _currentCameras = [];
	var _containerDiv;
	var _annotationsDiv;
	var _infoboxDiv;
	var _currentHovered = -1;
	var _currentEdited  = -1;
	var _pose = {
		position: new THREE.Vector3(),
		orientation: new THREE.Quaternion()
	};
	var _scale = 1;
	var _annotationCounter = 0;
	var _minRadius = 22;
	var _maxRadius = Math.min(window.innerWidth, window.innerHeight)/2.5;
	var _dimension = 1;
	var _that = this;
	var _hoverInfox = false;
	var _hoverAnnotation = false;
	var _visible = true;
	var _tx = 0;
	var _ty = 0;
	var _isFullscreen = false;
	var _lastRestingCamera;

	// apply prefixed styles to dom element
	var setStyle = function ( el, name, value, prefixes ) {

		prefixes = prefixes || [ "Webkit", "Moz", "O", "Ms" ];
		var n = prefixes.length;

		while ( n-- ) {
			var prefix = prefixes[n];
			el.style[ prefix + name.charAt( 0 ).toUpperCase() + name.slice( 1 ) ] = value;
			el.style[ name ] = value;
		}

	};

	//http://blog.stchur.com/2007/03/15/mouseenter-and-mouseleave-events-for-firefox-and-other-non-ie-browsers/
	function mouseEnter(func) {
		return function(e) {
			var relTarget = e.relatedTarget;
			if (this === relTarget || isAChildOf(this, relTarget)) {
				return;
			}
			func.call(this, e);
		};
	}

	function isAChildOf(parent, child) {
		if (parent === child) {
			return false;
		}
		while (child && child !== parent) {
			child = child.parentNode;
		}
		return child === parent;
	}

	function buildDOM() {
		_domCreated = true;

		var playerDiv = _player.getDiv();

		var rState = _player.packetViewer.resizeState;
		var w = rState.width*rState.scale;
		var h = rState.height*rState.scale;

		//container
		_containerDiv = document.createElement("div");
		_containerDiv.className = "PSAnnotationViewer";
		_tx = Math.floor((rState.containerWidth-w)/2);
		_ty = Math.floor((rState.containerHeight-h)/2);
		setStyle(_containerDiv, "transform", "translate("+_tx+ "px, "+_ty+ "px)");

		//annotations
		_annotationsDiv = document.createElement("div");
		_annotationsDiv.className = "PSAnnotations";
		_containerDiv.appendChild(_annotationsDiv);

		//infobox
		_infoboxDiv = document.createElement("div");
		_infoboxDiv.className = "PSAnnotationInfobox";
		_infoboxDiv.style.display = "none";

		var infoboxContentDiv = document.createElement("div");
		infoboxContentDiv.className = "content";

		//simulate mouseenter
		_infoboxDiv.addEventListener("mouseover", mouseEnter(function() {
			_hoverInfox = true;
		}), false);

		//simulate mouseleave
		_infoboxDiv.addEventListener("mouseout", mouseEnter(function() {
			_hoverInfox = false;
			hideInfobox();
		}), false);

		_infoboxDiv.appendChild(infoboxContentDiv);

		var infoboxEditButton = document.createElement("button");
		infoboxEditButton.style.display = _options.editEnabled ? "" : "none";
		infoboxEditButton.appendChild(document.createTextNode("edit"));

		new PS.Packet.SingleTouchInputHandler(infoboxEditButton, {
			onDown: function(e) {
				e.originalEvent.cancelBubble = true;
				_currentEdited = _currentHovered;
				_options.onAnnotationEdit(getAnnotation(_currentEdited), _tx, _ty);
				renderAnnotations();

				return true;
			}
		});
		_infoboxDiv.appendChild(infoboxEditButton);

		var infoboxDeleteButton = document.createElement("button");
		infoboxDeleteButton.style.display = _options.editEnabled ? "" : "none";
		infoboxDeleteButton.appendChild(document.createTextNode("delete"));

		new PS.Packet.SingleTouchInputHandler(infoboxDeleteButton, {
			onDown: function(e) {
				e.originalEvent.cancelBubble = true;
				_options.onAnnotationDelete(getAnnotation(_currentHovered));

				return true;
			}
		});

		_infoboxDiv.appendChild(infoboxDeleteButton);

		//In IE clicking on the infobox was discarding(=hiding) it -> cancelBubble to prevent this behavior.
		//this was also prevent <a> link from working in IE,
		new PS.Packet.SingleTouchInputHandler(_infoboxDiv, {
			onDown: function(e) {
				e.originalEvent.cancelBubble = true;
				return true;
			}
		});

		_containerDiv.appendChild(_infoboxDiv);

		//attach container to input layer of PSPacketPlayer
		var parent = playerDiv.getElementsByClassName("PSInputLayer")[0];
		parent.appendChild(_containerDiv);
	}

	this.resize = function(resizeState, mode) {
		if (_domCreated) {
			if (mode === PS.Packet.ResizeMode.Slow && !_isFullscreen) {
				_that.setLayerVisibility(true);

				var resizeState = _player.packetViewer.resizeState;
				var newDimension = Math.min(resizeState.width*resizeState.scale, resizeState.height*resizeState.scale);
				for (var i=0; i<_annotations.length; ++i) {
					_annotations[i].radius *= newDimension/_dimension;
				}
				_dimension = newDimension;

				_maxRadius = Math.min(window.innerWidth, window.innerHeight)/2.5;

				translateContainerAccordingToSeadragon();

				renderAnnotations();
			}
			else { //hidding annotations while in Fast resizing mode (rendering them cause performance issue)
				_that.setLayerVisibility(false);
			}
		}
	};

	this.setTransform = function(translateX, translateY, scale) {
		if (_visible && _domCreated) {
			_scale = scale;
			translateContainerAccordingToSeadragon();

			renderAnnotations();
		}
	};

	this.setFullscreenState = function(isFullscreen) {
		if (_domCreated) {
			_isFullscreen = isFullscreen;
			_that.setLayerVisibility(false);
		}
	};

	this.setLayerVisibility = function(visible) {
		if (_domCreated) {
			_visible = visible;
			_containerDiv.style.display = visible ? "" : "none";
			renderAnnotations();
		}
	};

	function translateContainerAccordingToSeadragon() {
		var seadragonViewer = _player.seadragonViewer;
		if (seadragonViewer.openSeadragon && seadragonViewer.openSeadragon.viewport && !seadragonViewer.isHomeZoom()) {

			var viewport    = seadragonViewer.openSeadragon.viewport;
			var homeBounds  = viewport.originalHomeBounds; //Don't use homeBounds as it will give wrong result in some case
			var homeTopLeft = viewport.pixelFromPoint(homeBounds.getTopLeft(), true);

			_tx = homeTopLeft.x;
			_ty = homeTopLeft.y;
		}
		else {
			//assuming home zoom
			var resizeState = _player.packetViewer.resizeState;
			_tx = (resizeState.containerWidth  - resizeState.width*resizeState.scale)/2;
			_ty = (resizeState.containerHeight - resizeState.height*resizeState.scale)/2;

		}
		setStyle(_containerDiv, "transform", "translate("+_tx+ "px, "+_ty+ "px)");
	}

	this.init = function(player) {
		_player = player;
		_annotations = [];

		var resizeState = _player.packetViewer.resizeState;
		_dimension = Math.min(resizeState.width*resizeState.scale, resizeState.height*resizeState.scale);

		if (!_domCreated) {
			buildDOM();
		}
		_options.onInitialized();
	};

	function showInfobox(annotationId) {
		if (_currentEdited === annotationId) {
			return;
		}

		var annotation = getAnnotation(annotationId);
		if (annotation) {
			_currentHovered = annotationId;

			var text = annotation ? annotation.text : "";
			_infoboxDiv.getElementsByClassName("content")[0].innerHTML = Autolinker.link(text, {truncate: 35, emails: false, twitter: false, stripPrefix: false});
			if (text !== "" || _options.editEnabled) {
				_infoboxDiv.style.display = "";
				unHoverAllAnnotations();
				annotation.div.classList.add("PSAnnotationHovered");
				renderAnnotations(); //this will position the infobox
			}
			else {
				unHoverAllAnnotations();
				_infoboxDiv.style.display = "none";
			}
		}
	}

	function unHoverAllAnnotations() {
		for (var i=0; i<_annotations.length; ++i) {
			_annotations[i].div.classList.remove("PSAnnotationHovered");
		}
	}

	function hideInfobox() {
		unHoverAllAnnotations();
		_currentHovered = -1;
		_infoboxDiv.style.display = "none";
	}

	this.add = function(worldPoint, visibility, visibilityPreset, distCamObject, camSIndex, queryPoint, surfaceOrientation, visible) {

		var id = _annotationCounter++;

		var annotationDiv = document.createElement("div");
		annotationDiv.className = "PSAnnotation";

		new PS.Packet.SingleTouchInputHandler(annotationDiv, {
			onDown: (function() {
				var annotationId = id;
				return function(e) {
					/*
					//previous behaviour
					e.originalEvent.stopPropagation();
					if (_currentHovered !== annotationId) {
						showInfobox(annotationId);
					}
					_options.onAnnotationClick(getAnnotation(annotationId), _lastRestingCamera);
					*/

					//new behaviour (try to keep the clicked annotation highlighted + display the infobox)
					e.originalEvent.stopPropagation();

					setTimeout(function() {
						showInfobox(annotationId);
						var annotation = getAnnotation(annotationId);
						if (annotation) {
							annotation.div.classList.add("PSAnnotationHovered");
						}
					}, 300);

					var annotation = getAnnotation(annotationId);
					_options.onAnnotationClick(annotation, _lastRestingCamera);

					return true;
				};
			})()
		});

		annotationDiv.addEventListener("mouseover", (function() {
			var annotationId = id;
			return function() {
				_hoverAnnotation = true;
				if (_currentHovered !== annotationId) {
					showInfobox(annotationId);
				}
			};
		})(), false);
		annotationDiv.addEventListener("mouseout", (function() {
			return function() {
				_hoverAnnotation = false;
				setTimeout(function() {
					if (!_hoverInfox && !_hoverAnnotation) {
						hideInfobox();
					}
				}, 5);
			};
		})(), false);
		_annotationsDiv.appendChild(annotationDiv);

		var annotation = new Annotation(worldPoint, visibility, visibilityPreset, surfaceOrientation, distCamObject, camSIndex, queryPoint, annotationDiv, id);
		annotation.visible = visible;
		_annotations.push(annotation);

		renderAnnotations();

		return id;
	};

	function getAnnotation(id) {
		for (var i=0; i<_annotations.length; ++i) {
			var annotation = _annotations[i];
			if (annotation.id === id) {
				return annotation;
			}
		}
		return null;
	}

	this.setRadius = function(id, radius) {
		var annotation = getAnnotation(id);
		if (annotation) {
			annotation.radius = radius/_scale;
			renderAnnotations();
		}
	};

	this.setVisibility = function(id, visibility) {
		var annotation = getAnnotation(id);
		if (annotation) {
			annotation.visibility = visibility;
			renderAnnotations();
		}
	};

	this.setVisible = function(id, visible) {
		var annotation = getAnnotation(id);
		if (annotation) {
			annotation.visible = visible;
			renderAnnotations();
		}
	};

	this.setText = function(id, text) {
		var annotation = getAnnotation(id);
		if (annotation) {
			annotation.text = text;
			renderAnnotations();
		}
	};

	this.setPersistentId = function(id, dbid) {
		var annotation = getAnnotation(id);
		if (annotation) {
			annotation.dbid = dbid;
		}
	};

	this.setEditable = function(id, editable) {
		if (editable) {
			_currentEdited = id;
		}
		else {
			_currentEdited = -1;
		}
	};

	this.setVisibilityEditable = function(id, editable) {
		var annotation = getAnnotation(id);
		if (annotation) {
			if (editable) {
				annotation.div.classList.add("PSAnnotationEdited");
			}
			else {
				annotation.div.classList.remove("PSAnnotationEdited");
			}
		}
	};

	this.setVisibilityPreset = function(id, preset) {
		var annotation = getAnnotation(id);
		if (annotation) {
			annotation.visibilityPreset = preset;
		}
	};

	this.setConnectionInfo = function(id, transform) {
		var annotation = getAnnotation(id);
		if (annotation) {
			annotation.transform = transform;
		}
	};

	this.remove = function(id) {
		var annotation = getAnnotation(id);
		if (annotation) {
			_annotationsDiv.removeChild(annotation.div);              //remove annotation from the DOM
			_annotations.splice(_annotations.indexOf(annotation), 1); //remove annotation from _annotations[]
			if (_currentHovered === annotation.id) {
				hideInfobox();
			}
			if (_currentEdited === annotation.id) {
				_currentEdited = -1;
			}
		}
	};

	this.onCameraChanged = function(camera) {
		_lastRestingCamera = camera;
		_pose.position.copy(camera.pose.position);
		_pose.orientation.copy(camera.pose.orientation);
		renderAnnotations();
	};

	this.onCamerasChanged = function(a, b) {
		var cameras = _player.packetViewer.getCameras();
		_currentCameras = [cameras[a], cameras[b]];
	};

	this.onPoseChanged = function(camera) {
		_pose.position.copy(camera.position);
		_pose.orientation.copy(camera.quaternion);
		renderAnnotations();
	};

	function renderAnnotations() {
		if (_annotations.length > 0 && _visible && _currentCameras.length > 0) {
			var persCamera = _player.packetViewer.renderer.getCamera();
			var qIndex     = _player.packetViewer.state.currentQIndex;
			var path       = _player.packetViewer.dataset.path;
			_projectionMatrix.identity();
			_projectionMatrix.multiplyMatrices(persCamera.projectionMatrix, persCamera.matrixWorldInverse);

			var rState = _player.packetViewer.resizeState;
			var w = rState.width*rState.scale;
			var h = rState.height*rState.scale;

			for (var i=0; i<_annotations.length; ++i) {
				var annotation = _annotations[i];
				var annotationDiv = annotation.div;

				//display annotation if one of the 2 current cameras in the viewer is in the list of the annotation visibility
				if (annotation.visible && (annotation.visibility.indexOf(_currentCameras[0].index) !== -1 || annotation.visibility.indexOf(_currentCameras[1].index) !== -1)) {

					var opacity = 0.5;
					var isVisibleInA = annotation.visibility.indexOf(_currentCameras[0].index) !== -1;
					var isVisibleInB = annotation.visibility.indexOf(_currentCameras[1].index) !== -1;
					if (isVisibleInA && isVisibleInB) {
						opacity = 1.0;
					}
					else {
						var distA = path.shortestDistance(_currentCameras[0].qIndex, qIndex);
						var distB = path.shortestDistance(_currentCameras[1].qIndex, qIndex);
						var dist  = path.shortestDistance(_currentCameras[0].qIndex, _currentCameras[1].qIndex);
						opacity = isVisibleInA ? distB / dist : distA / dist;
						opacity = Math.min(1, Math.max(0, opacity)); //sanity check
					}

					//update annotation circle property (x,y,radius)
					updateAnnotation(annotation, _projectionMatrix, w, h, opacity);

					//make annotation visible (or not if opacity = 0)
					annotationDiv.style.display = opacity === 0 ? "none" : "";
				}
				else {
					//hide non visible annotation
					annotationDiv.style.display = "none";

					//hide infobox of non visible annotation
					if (_currentHovered === annotation.id) {
						hideInfobox();
					}

					//update non visible annotation if they are currently edited
					if (_currentEdited === annotation.id) {
						updateAnnotation(annotation, _projectionMatrix, w, h, 0.2);
						//annotationDiv.style.display = ""; //TODO: display them
					}
				}

				//move edit infobox of edited annotation
				if (_currentEdited === annotation.id) {
					_options.onEditedAnnotationMove(annotation, _tx, _ty);
				}
			}
		}
	}

	function updateAnnotation(annotation, projectionMatrix, w, h, opacity) {

		//compute 2d projection of the 3d anchor of the annotation
		var worldPoint = annotation.worldPoint;
		var rp = worldPoint.clone();
		rp.applyProjection(projectionMatrix);
		var px = (( rp.x + 1) * ((w) / 2.0));
		var py = ((-rp.y + 1) * ((h) / 2.0));
		px *= _scale;
		py *= _scale;

		//don't display annotations behind the camera (= with negative depth)
		var rp2 = worldPoint.clone();
		rp2.applyMatrix4(projectionMatrix);
		if (rp2.z < 0) {
			return;
		}

		//update radius of the annotation based on depth + min and max constraints
		var radius = annotation.radius*annotation.distCamObject/worldPoint.distanceTo(_pose.position)*_scale;
		annotation.accurateRadius = radius;
		radius = Math.max(_minRadius, Math.min(_maxRadius, radius));

		//update circle div property (x,y,radius)
		var annotationDiv = annotation.div;
		annotationDiv.style.top  = (py-radius)+"px";
		annotationDiv.style.left = (px-radius)+"px";
		annotationDiv.style.width = annotationDiv.style.height = (radius*2)+"px";
		annotationDiv.style.opacity = opacity;

		//move infobox of hovered and not edited annotation
		if (annotation.visible && _currentHovered === annotation.id && _currentEdited !== annotation.id) {
			updateInfobox(px, py, radius);
		}
	}

	function updateInfobox(px, py, radius) {
		var width   = _infoboxDiv.offsetWidth;  //bad: cause reflow
		var height  = _infoboxDiv.offsetHeight; //bad: cause reflow
		var hheight = height/2;
		var hwidth  = width/2;
		var center = new THREE.Vector2(_tx+px, _ty+py);

		var offsetInfoboxAnchor = -10; //default was 30 but now there is a transparent border of 30px

		//position infobox horizontally
		if (center.x+radius+offsetInfoboxAnchor+width < window.innerWidth) { //right
			_infoboxDiv.style.left = (px+radius+offsetInfoboxAnchor) +"px";
		}
		else { //left
			_infoboxDiv.style.left = (px-radius-offsetInfoboxAnchor-width) +"px";
		}

		//position infobox vertically
		if (center.y > window.innerHeight) {
			/*
			   +-----+
			   |     |
			   |     |
			   |     |
			   +-----+
				  v
			*/

			//normal case
			_infoboxDiv.style.top  = (py-radius-offsetInfoboxAnchor-height)+"px";
			_infoboxDiv.style.left = (px-hwidth)+"px";

			if (center.x+hwidth > window.innerWidth) {
				//right corner case

				var corner = new THREE.Vector2(window.innerWidth, window.innerHeight);

				if (center.x > window.innerWidth) {
					//center.x outside of frame
					var anchor = corner.sub(center).normalize().multiplyScalar(radius+offsetInfoboxAnchor).add(center);
					_infoboxDiv.style.left = (anchor.x - _tx - width)  + "px";
					_infoboxDiv.style.top  = (anchor.y - _ty - height) + "px";
				}
				else {
					//center.x inside of frame
					var top       = center.clone().add(new THREE.Vector2(0, -radius));
					var direction = top.sub(corner).clone();
					var anchor    = direction.clone().normalize().multiplyScalar(direction.length()+offsetInfoboxAnchor).add(corner);
					_infoboxDiv.style.left = (anchor.x - _tx - width)  + "px";
					_infoboxDiv.style.top  = (anchor.y - _ty - height) + "px";
				}
			}
			else if (center.x-hwidth < 0) {
				//left corner case

				var corner = new THREE.Vector2(0, window.innerHeight);

				if (center.x < 0) {
					//center.x outside of frame
					var anchor = corner.sub(center).normalize().multiplyScalar(radius+offsetInfoboxAnchor).add(center);
					_infoboxDiv.style.left = (anchor.x - _tx) + "px";
					_infoboxDiv.style.top  = (anchor.y - _ty - height) + "px";
				}
				else {
					//center.x inside of frame
					var top       = center.clone().add(new THREE.Vector2(0, -radius));
					var direction = top.sub(corner).clone();
					var anchor    = direction.clone().normalize().multiplyScalar(direction.length()+offsetInfoboxAnchor).add(corner);
					_infoboxDiv.style.left = (anchor.x - _tx) + "px";
					_infoboxDiv.style.top  = (anchor.y - _ty - height) + "px";
				}
			}
		}
		else if (center.y < 0) {
			/*    ^
			   +-----+
			   |     |
			   |     |
			   |     |
			   +-----+
			*/

			//normal case
			_infoboxDiv.style.top  = (py+radius+offsetInfoboxAnchor)+"px";
			_infoboxDiv.style.left = (px-hwidth)+"px";

			if (center.x+hwidth > window.innerWidth) {
				//right corner case

				var corner = new THREE.Vector2(window.innerWidth, 0);

				if (center.x > window.innerWidth) {
					//center.x outside of frame
					var anchor = corner.sub(center).normalize().multiplyScalar(radius+offsetInfoboxAnchor).add(center);
					_infoboxDiv.style.left = (anchor.x - _tx - width)  + "px";
					_infoboxDiv.style.top  = (anchor.y - _ty) + "px";
				}
				else {
					//center.x inside of frame
					var down      = center.clone().add(new THREE.Vector2(0, radius));
					var direction = down.sub(corner).clone();
					var anchor    = direction.clone().normalize().multiplyScalar(direction.length()+offsetInfoboxAnchor).add(corner);
					_infoboxDiv.style.left = (anchor.x - _tx - width)  + "px";
					_infoboxDiv.style.top  = (anchor.y - _ty) + "px";
				}
			}
			else if (center.x-hwidth < 0) {
				//left corner case

				var corner = new THREE.Vector2(0, 0);

				if (center.x < 0) {
					//center.x outside of frame
					var anchor = corner.sub(center).normalize().multiplyScalar(radius+offsetInfoboxAnchor).add(center);
					_infoboxDiv.style.left = (anchor.x - _tx) + "px";
					_infoboxDiv.style.top  = (anchor.y - _ty) + "px";
				}
				else {
					//center.x inside of frame
					var down      = center.clone().add(new THREE.Vector2(0, radius));
					var direction = down.sub(corner).clone();
					var anchor    = direction.clone().normalize().multiplyScalar(direction.length()+offsetInfoboxAnchor).add(corner);
					_infoboxDiv.style.left = (anchor.x - _tx) + "px";
					_infoboxDiv.style.top  = (anchor.y - _ty) + "px";
				}
			}
		}
		else if (center.y-hheight > 0 && center.y+hheight < window.innerHeight) {
			/*
			   +------+
			   |      |
			 < |      |
			   |      |
			   +------+
			*/
			_infoboxDiv.style.top = (py-hheight)+"px";
		}
		else if (center.y-height > 0 && center.y < window.innerHeight) {
			/*
			   +------+
			   |      |
			   |      |
			   |      |
			 < +------+
			*/
			_infoboxDiv.style.top  = (py-height)+"px";
		}
		else {
			/*
			 < +------+
			   |      |
			   |      |
			   |      |
			   +------+
			*/
			_infoboxDiv.style.top  = py+"px";
		}
	}

	this.dump = function() {

		var resizeState = _player.packetViewer.resizeState;
		var dimension = Math.min(resizeState.width*resizeState.scale, resizeState.height*resizeState.scale);
		return {
			"annotations": _annotations.map(function(a) { return {
					worldPoint: a.worldPoint.toArray(),
					queryPoint: a.queryPoint.toArray(),
					visibility: a.visibility.toString(),
					radius:     a.radius/dimension,
					text:       a.text,
					imgIndex:   _player.packetViewer.dataset.cameras[a.camSIndex].index,
					dbid:       a.dbid,
					surfaceOrientation: a.surfaceOrientation.toArray() //xyzw
				};
			})
		};
	};

	this.load = function(annotations) {
		var resizeState = _player.packetViewer.resizeState;
		_dimension = Math.min(resizeState.width*resizeState.scale, resizeState.height*resizeState.scale);

		var dataset = _player.packetViewer.dataset;

		//jshint loopfunc: true
		for (var i=0; i<annotations.length; ++i) {
			var a = annotations[i];

			var worldPoint = new THREE.Vector3().fromArray(a.worldPoint);
			var camera     = dataset.getCameraByIndex(a.imgIndex);
			var id = _that.add(
				worldPoint,
				a.visibility.split(",").map(function(c) { return parseInt(c, 10); }), //visibility
				a.visibilityPreset,
				worldPoint.distanceTo(camera.pose.position),
				camera.sIndex,
				new THREE.Vector2().fromArray(a.queryPoint),
				new THREE.Quaternion().fromArray(a.surfaceOrientation),
				true //visible
			);
			_that.setText(id, a.text);
			_that.setRadius(id, a.radius*_dimension*_scale);
			_that.setPersistentId(id, a.dbid);
			if (a.transform) {
				_that.setConnectionInfo(id, a.transform);
			}
		}
		//jshint loopfunc: false
	};

	this.get = function(id) {
		var annotation = getAnnotation(id);
		if (annotation) {
			var resizeState = _player.packetViewer.resizeState;
			var dimension = Math.min(resizeState.width * resizeState.scale, resizeState.height * resizeState.scale);

			return {
				worldPoint: annotation.worldPoint.toArray(),
				queryPoint: annotation.queryPoint.toArray(),
				visibility: annotation.visibility.toString(),
				visibilityPreset: annotation.visibilityPreset,
				radius:     annotation.radius / dimension,
				text:       annotation.text,
				dbid:       annotation.dbid,
				imgIndex:   _player.packetViewer.dataset.cameras[annotation.camSIndex].index,
				surfaceOrientation: annotation.surfaceOrientation.toArray() //xyzw
			};
		}
	};

	this.getRaw = function(id) {
		return getAnnotation(id);
	};

	this.clear = function() {
		hideInfobox();
		_currentHovered = -1;
		_currentEdited  = -1;
		while (_annotations.length > 0) {
			_that.remove(_annotations[0].id);
		}
	};

	this.forceRender = function() {
		renderAnnotations();
	};

	this.destroy = function() {
		//TODO: implement that
	};
};
