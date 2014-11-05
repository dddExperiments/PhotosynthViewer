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

//TODO: put some of these in an options object?
PS.Packet.MultiViewCameraController = function (inputElem, packetViewer, seadragonViewer, packetPath, packetStartTransitionPercent, packetDraggingDirection, animateSpeed, options) {

	var _options = { //default options
		onTapped:            function() {}, //fired when the user taps on viewer
		onLog:               function() {},
		onKeyDown:           function() {},
		onKeyUp:             function() {},
		onInputModeChange:   function() {},
		onCtrlClick:         function() {},
		inertiaDampingPerMS: 0.995,
		draggingSpeedFactor: 1
	};
	PS.extend(_options, options); //override default options

	this.setOptions = function(options) {
		PS.extend(_options, options);
	};

	this.getOptions = function() { //returning a copy of the options
		var options = {};
		PS.extend(options, _options);

		return options;
	};

	var InputModes = {
		Seadragon:             0,
		Packet:                1,
		TransitionToSeadragon: 2,
		TransitionToPacket:    3,
		TransitionToPortal:    4,
		toString: function(mode) {
			switch (mode) {
				case 0:  return "Seadragon";
				case 1:  return "Packet";
				case 4:  return "TransitionToPortal";
				case 2:  return "TransitionToSeadragon";
				default: return "TransitionToPacket";
			}
		}
	};

	this.resetCurrentPosition = function(qIndex) {
		_currentArcPosition = qIndex;
	};

	this.reset = function(dataset) {
		_currentArcPosition = dataset.startTransitionPercent;
		_path               = dataset.path;
		_pathLength         = dataset.path.nbPoints - 1;
		_draggingDirection  = dataset.draggingDirection;
		_animateSpeed       = animateSpeed; //TODO ?
	};

	var _animateSpeed = animateSpeed;

	var _inputElem = inputElem;
	var _packetViewer = packetViewer;
	var _seadragonViewer = seadragonViewer;

	var _inputMode = InputModes.Packet;

	if (_seadragonViewer) {
		_seadragonViewer.setAnimationCallback(_seadragonAnimation);
	}
	var _seadragonEnabled = true;

	var _prevScale;
	var _prevTranslationX;
	var _prevTranslationY;
	var _pointerCount;

	var _gestureWithinTapRange;

	var GestureTapDistance = 2;

	var _keyboardVelocity = new PS.Packet.KeyboardVelocity(1.0);
	var _animationLoopRunning = false;
	var _prevUpdate = null;
	var _keyboardPrevSnapCamera = null;
	var _keyboardDelta = new THREE.Vector2(0, 0);

	var _forceMouseWheelToHome = true;

	var _gestureHelper = new PS.Packet.MultiTouchGestureHandler(_inputElem, {
		discreteZoom:  onDiscreteZoom,
		gestureStart:  onGestureStart,
		gestureChange: onGestureChange,
		gestureEnd:    onGestureEnd,
		keyDown:       onKeyDown,
		keyUp:         onKeyUp,
		onLog:         _options.onLog
	});

	this.focusKeyboardElement = function() {
		_gestureHelper.focusKeyboardElement();
	};

	this.blurKeyboardElement = function() {
		_gestureHelper.blurKeyboardElement();
	};

	this.destroy = function() {
		_gestureHelper.destroy();
		_gestureHelper = null;
	};

	var _gestureVelocity = new PS.Packet.GestureVelocity();

	var _inertiaVelocity = 0;
	var _inertiaGoing = false;
	var _inertiaStartTime;
	var _inertiaDuration;
	var _inertiaStartPos;
	var _inertiaEndPos;
	var _inertiaEndCamera;
	var _inertiaPos;

	//TODO: this should probably be related to the animationSpeed (aka, the average camera distance along path)
	var InertiaVelocityCutoff = 0.5 / 1000; //unit is path units per millisecond

	//------------------ Packet viewer helpers -----------------------

	var _currentArcPosition = packetStartTransitionPercent;
	var _path = packetPath;
	var _pathLength = packetPath.nbPoints - 1;
	var _draggingDirection = packetDraggingDirection;

	function _getDelta(delta) {
		return _draggingDirection.dot(delta) * _animateSpeed;
	}

	this.forceInputMode = function(mode) {
		setInputMode(mode);
	};

	function setInputMode(mode) {
		if (mode !== _inputMode) {
			_inputMode = mode;
			_options.onInputModeChange(_inputMode, InputModes.toString(_inputMode));
			_packetViewer.setSeadragonDraggingCursor(mode === InputModes.Seadragon);
		}
	}

	//------------------ Seadragon viewer helpers --------------------

	function _seadragonAnimation() {

		if (_inputMode === InputModes.Packet || _inputMode === InputModes.TransitionToSeadragon) {
			//Seadragon not visible.  Do nothing.
			return;
		}

		if (_inputMode === InputModes.TransitionToPacket) {
			if (_seadragonViewer.isHomeZoom()) {
				setInputMode(InputModes.TransitionToSeadragon);
			}
		}
		else if (_inputMode === InputModes.Seadragon) {
			if (_seadragonViewer.isHomeZoom() && !_keyboardVelocity.anyKeysDown()) {
				setInputMode(InputModes.TransitionToSeadragon);
			}
		}

		var homeBounds = _seadragonViewer.openSeadragon.viewport.homeBounds;

		var topLeft     = _seadragonViewer.openSeadragon.viewport.pixelFromPoint(homeBounds.getTopLeft(),     true);
		var bottomRight = _seadragonViewer.openSeadragon.viewport.pixelFromPoint(homeBounds.getBottomRight(), true);
		var width  = bottomRight.x - topLeft.x;
		var height = bottomRight.y - topLeft.y;

		var center = _seadragonViewer.openSeadragon.viewport.pixelFromPoint(homeBounds.getCenter(), true);

		var canvasRect    = _packetViewer.getCanvasRect();
		var seadragonRect = _seadragonViewer.getViewportRect();

		var canvasAspect    = canvasRect.w / canvasRect.h;
		var seadragonAspect = seadragonRect.width / seadragonRect.height;

		var scale = (seadragonAspect > canvasAspect) ? height / seadragonRect.height : width / seadragonRect.width;
		var translateX = center.x - canvasRect.centerX + seadragonRect.left;
		var translateY = center.y - canvasRect.centerY + seadragonRect.top;

		_packetViewer.setContainerTransform(translateX, translateY, scale);
	}

	function _getRefPoint(x, y) {
		var offset = _seadragonViewer.getOffset();
		return _seadragonViewer.openSeadragon.viewport.pointFromPixel(new OpenSeadragon.Point(x - offset.x, y - offset.y));
	}

	function _applyMinZoom(minZoom) {
		if (_seadragonViewer.openSeadragon.viewport.getZoom() < minZoom) {
			_seadragonViewer.openSeadragon.viewport.zoomTo(minZoom, _seadragonViewer.openSeadragon.viewport.getCenter());
		}
		_seadragonViewer.openSeadragon.viewport.visibilityRatio = 0.5;
		_seadragonViewer.openSeadragon.viewport.applyConstraints();
	}

	function _applyConstraints() {
		_applyMinZoom(_seadragonViewer.openSeadragon.viewport.getHomeZoom());
		_seadragonViewer.openSeadragon.viewport.visibilityRatio = 1;
		_seadragonViewer.openSeadragon.viewport.applyConstraints();
	}

	function _applyLooseConstraints() {
		var halfHomeZoom = _seadragonViewer.openSeadragon.viewport.getHomeZoom() / 2;
		_applyMinZoom(halfHomeZoom);
	}

	this.setSeadragonEnabled = function(enable) {
		_seadragonEnabled = enable;
	};

	this.setCameraMode = function (mode) {
		if (mode === PS.Packet.CameraMode.Global) {
			_gestureHelper.disable();
		}
		else {
			_gestureHelper.enable();
			_packetViewer.setCameraMode(mode);
			setPosition(_currentArcPosition);
		}
	};

	this.setCurrentArcPosition = function (position) {
		_currentArcPosition = position;
	};

	this.zoomTo = function(bounds) {
		//this function is only used for the highlight demo (viewer4.php)
		setInputMode(InputModes.Seadragon);
		_seadragonViewer.openSeadragon.viewport.zoomSpring.animationTime = 8.0;
		_seadragonViewer.openSeadragon.viewport.fitBounds(bounds);
		setTimeout(function() {
			_seadragonViewer.openSeadragon.viewport.zoomSpring.animationTime = 1.5;
		}, 2042); //ARGHHH: default SpringFitness = 5, but I'm using 20 thus animationTime need to be divided by 4 :( 8.0s / 4 =  2000ms + 42ms (security)
	};

	//------------------ End viewer-specific helpers -----------------


	function onGestureStart(e) {

		_packetViewer.resetAnimateTimer(true);
		_gestureWithinTapRange = true;
		_animationLoopRunning  = false;
		_inertiaGoing = false;

		_gestureVelocity.onGestureStart(e);

		_prevScale = 1;
		_prevTranslationX = 0;
		_prevTranslationY = 0;
		_pointerCount = e.pointerCount;

		if (_keyboardVelocity.anyKeysDown()) {
			return;
		}

		if (e.pointerCount === 1) {
			// single finger down

			if (e.originalEvent && e.originalEvent.ctrlKey) {
				if (seadragonAvailable()) {
					_options.onCtrlClick(e.layerX, e.layerY);
				}
			}

			if (_inputMode === InputModes.Packet || _inputMode === InputModes.TransitionToSeadragon) {
				if (_packetViewer.renderer.overlayScene.intersect(e, _packetViewer.resizeState)) {
					setInputMode(InputModes.TransitionToPortal);
					return;
				}
			}

			if (!e.pointersStillDown) {
				if (_inputMode === InputModes.Seadragon) {

					if (_seadragonViewer.isHomeZoom()) {
						//Seadragon viewer is at home location.
						//Single finger should cause 3d movement.
						setInputMode(InputModes.Packet);
					}
					else if (_seadragonViewer.openSeadragon.viewport.getZoom() === _seadragonViewer.openSeadragon.viewport.getHomeZoom()) {
						//Seadragon viewer is animating to home location
						//Once it's there, single finger motions should cause 3d movement
						setInputMode(InputModes.TransitionToPacket);
					}
				}
				else if (_inputMode === InputModes.Packet || _inputMode === InputModes.TransitionToSeadragon) {
					_packetViewer.stopSnappingToCamera();
					_packetViewer.resetAnimateTimer();

					_packetViewer.dataset.path.makePersistentVirtualPathTemporary();
				}
			}
		}
		else {
			if (e.pointerCount === null || e.pointerCount < 2) {
				//TODO: determine cause of this issue
				//console.error("pointerCount is wrong: " + e.pointerCount);
			}
		}
	}

	function seadragonAvailable() {
		return _seadragonViewer && _seadragonViewer.openSeadragon && _seadragonEnabled;
	}

	function onGestureChange(e) {

		_gestureVelocity.onGestureChange(e);

		if (_gestureWithinTapRange) {
			var dist = Math.sqrt((e.translationX * e.translationX) + (e.translationY * e.translationY));
			if (dist > GestureTapDistance) {
				_gestureWithinTapRange = false;
			}
		}

		if (_keyboardVelocity.anyKeysDown()) {
			_prevScale = e.scale;
			_prevTranslationX = e.translationX;
			_prevTranslationY = e.translationY;
			return;
		}

		_keyboardPrevSnapCamera = null;

		if (_inputMode === InputModes.TransitionToSeadragon) {
			var transitionComplete = _seadragonViewer && _seadragonViewer.isVisible(); //TODO: find out why if seadragonEnabled = false we can enter this mode

			//Single finger is allowed to iterrupt transition; two or more are not allowed to
			if (transitionComplete || _pointerCount === 1) {
				//Transition is complete, allow the change event to fall down to handling code below.
				setInputMode((_pointerCount > 1 && seadragonAvailable()) ? InputModes.Seadragon : InputModes.Packet);
			}
			else {
				//Animating to camera and seadragon not yet visible.  Ignore input.
				_prevScale = e.scale;
				_prevTranslationX = e.translationX;
				_prevTranslationY = e.translationY;
			}
		}
		else if (_inputMode === InputModes.TransitionToPacket) {
			if (_seadragonViewer.isHomeZoom()) {
				setInputMode((_pointerCount > 1 && seadragonAvailable()) ? InputModes.Seadragon : InputModes.Packet);
			}
			else {
				//Animating to home, ignore input
				_prevScale = e.scale;
				_prevTranslationX = e.translationX;
				_prevTranslationY = e.translationY;
			}
		}

		if (_inputMode === InputModes.Seadragon) {

			var x = e.layerX;
			var y = e.layerY;

			var deltaX = e.translationX - _prevTranslationX;
			var deltaY = e.translationY - _prevTranslationY;
			var factor = e.scale / _prevScale;
			var refPoint = _getRefPoint(x, y);

			_seadragonViewer.openSeadragon.viewport.panBy(_seadragonViewer.openSeadragon.viewport.deltaPointsFromPixels(new OpenSeadragon.Point(-deltaX, -deltaY)), true);

			_seadragonViewer.openSeadragon.viewport.zoomBy(factor, refPoint, true);

			_prevScale = e.scale;
			_prevTranslationX = e.translationX;
			_prevTranslationY = e.translationY;
		}
		else if (_inputMode === InputModes.Packet) {
			_packetViewer.setContainerTransform(0, 0, 1);

			var deltaX = (e.translationX - _prevTranslationX);
			var deltaY = (e.translationY - _prevTranslationY);
			var position = getPositionDelta(deltaX, deltaY) + _currentArcPosition;
			setPosition(position);
		}
	}

	function setPosition(position) {
		_packetViewer.stopSnappingToCamera();
		_packetViewer.setPosition(position);
		_packetViewer.resetAnimateTimer(true);
	}

	function getPositionDelta(deltaX, deltaY) {
		var delta = new THREE.Vector2(deltaX / _inputElem.clientWidth, deltaY / _inputElem.clientHeight);
		return _getDelta(delta) * _pathLength * _options.draggingSpeedFactor;
	}

	function getRestPosition(dampingConst, initVelocity, initPosition, restSpeed) {
		//Velocity with respect to time (in ms) follows this function:
		//   v = initVelocity * (dampingConst ^ t)

		//Note, this function assumes motion follows a perfect integration.
		//In reality, the slope is calculated every 30 or more milliseconds and acts as if there were a constant velocity over that time.
		//Therefore, the calculated rest position is currently always further than the actual rest position.
		//As long as the code that combines the two paths into one takes this into account, it should be ok.

		var initSpeed = Math.abs(initVelocity);

		if (initSpeed <= restSpeed) {
			return [initPosition, 0];
		}

		//First, solve for t where the velocity falls below the restSpeed threshold
		var logDampingConst = Math.log(dampingConst);
		var restTime = Math.log(restSpeed / initSpeed) / logDampingConst;

		//Then solve for position at that time
		//Position is the integral of that, and follows this function:
		//   p = initPosition + ((initVelocity * (dampingConst ^ t)) / ln(dampingConst))
		//We want to get the integral from t=0 to t=restTime

		var positionMultiplier = (initSpeed / logDampingConst);
		var deltaPos = positionMultiplier * (Math.pow(dampingConst, restTime) - Math.pow(dampingConst, 0));

		if (initSpeed !== initVelocity) {
			deltaPos = -deltaPos;
		}

		var restPos = initPosition + deltaPos;

		return [restPos, restTime];
	}

	function onGestureEnd(e) {

		if (_inputMode === InputModes.TransitionToPortal) {
			setInputMode(InputModes.Packet);

			return;
		}

		var gestureVelocity = _gestureVelocity.onGestureEnd(e);

		if (_gestureWithinTapRange) {
			_options.onTapped();
		}

		if (_keyboardVelocity.anyKeysDown()) {
			return;
		}

		if (_inputMode === InputModes.Seadragon && !e.pointersStillDown) {
			_applyConstraints();
		}

		if (_inputMode === InputModes.TransitionToSeadragon) {
			setInputMode(InputModes.Packet);
		}

		if (_inputMode === InputModes.Packet) {
			if (_pointerCount === 1) {

				if (e.pointersStillDown) {
					//If pointers are still down, then user went from 1 to two fingers.  Snap to nearest and do NOT respect moving direction because they may not have meant to move the first finger.
					var deltaX   = (e.translationX - _prevTranslationX);
					var deltaY   = (e.translationY - _prevTranslationY);
					var position = getPositionDelta(deltaX, deltaY) + _currentArcPosition;
					position = _path.fixRange(position);

					var closestCamera = _packetViewer.dataset.path.getClosestCamera(position, false);
					_packetViewer.snapToCamera(closestCamera, { duration: (e.pointersStillDown) ? 100 : 300 });

					if (seadragonAvailable()) {
						setInputMode(InputModes.TransitionToSeadragon);
					}
				}
				else {
					//If pointers are NOT still down, then user released single finger, calculate inertia.
					_inertiaVelocity = getPositionDelta(gestureVelocity.x, gestureVelocity.y);

					_inertiaStartTime = Date.now();
					_inertiaStartPos = _path.fixRange(_packetViewer.getCurrentQIndex());
					_inertiaPos      = _inertiaStartPos;

					var restPositionAndDuration = getRestPosition(_options.inertiaDampingPerMS, _inertiaVelocity, _inertiaStartPos, InertiaVelocityCutoff);

					var restPosition = restPositionAndDuration[0];
					_inertiaDuration = restPositionAndDuration[1];

					var fixedPosition = _path.fixRange(restPosition);
					var closestCamera = _packetViewer.dataset.path.getClosestCamera(fixedPosition, false);

					_inertiaEndCamera = closestCamera;
					_inertiaEndPos    = closestCamera.qIndex;

					if (_path.isClosed) {
						//The inertia end position can wrap around in either direction from the rest position
						//While it is more than half the path away, loop it around the path.

						var nbPoints = _path.nbPoints;
						var halfNbPoints = nbPoints / 2;

						while (_inertiaEndPos - restPosition > halfNbPoints) {
							_inertiaEndPos -= nbPoints;
						}
						while (restPosition - _inertiaEndPos > halfNbPoints) {
							_inertiaEndPos += nbPoints;
						}
					}

					var distance = Math.abs(_inertiaStartPos - _inertiaEndPos);
					var radius   = _packetViewer.dataset.path.getPersistentVirtualPathRadius();

					if (distance < radius) {
						_packetViewer.snapToCamera(closestCamera, { duration: 500 });

						if (seadragonAvailable()) {
							setInputMode(InputModes.TransitionToSeadragon);
						}
					}
					else {
						_packetViewer.dataset.path.createPersistentVirtualPath(closestCamera, true);

						_inertiaGoing = true;
						startAnimationLoop();
					}
				}
			}
		}
	}

	function onDiscreteZoom(e) {
		_packetViewer.resetAnimateTimer(true);
		if (seadragonAvailable() && _seadragonViewer.isVisible()) {

			if (_forceMouseWheelToHome && e.direction < 0) {
				if (!seadragonViewer.isHomeZoom()) {
					_seadragonViewer.openSeadragon.viewport.goHome();

					setInputMode(InputModes.TransitionToPacket);
				}
			}
			else {

				var x = e.layerX;
				var y = e.layerY;

				var factor   = e.direction < 0 ? 0.83333333333333 : 1.2;
				var refPoint = _getRefPoint(x, y);

				_seadragonViewer.openSeadragon.viewport.zoomBy(factor, refPoint);
				_applyConstraints();
				setInputMode(InputModes.Seadragon);
			}
		}
	}

	function onKeyDown(e) {

		var wasUsed = _options.onKeyDown(e);

		wasUsed |= _keyboardVelocity.keyDown(e);
		var keyDownDirection = _keyboardVelocity.getKeydownDirection();

		if (_packetViewer.isPlaying() && keyDownDirection.z !== 0) {
			//the packet viewer is animating and the user press + or -
			//-> stop the animation, snap to the closest camera and switch to TransitionToSeadragon InputModes.
			_packetViewer.stopSnappingToCamera();
			_packetViewer.resetAnimateTimer();
			setInputMode(InputModes.TransitionToSeadragon);
			_packetViewer.snapToCamera(_packetViewer.dataset.path.getClosestCamera(_packetViewer.getCurrentQIndex(), true));
		}
		else if (!_animationLoopRunning && _keyboardVelocity.updateNeeded()) {
			if (_inputMode === InputModes.Seadragon) {
				if (_seadragonViewer.isHomeZoom() && _keyboardUserTryingToPan(keyDownDirection)) {
					//Seadragon viewer is at home location.
					//Single finger should cause 3d movement.
					setInputMode(InputModes.Packet);
				}
			}

			if ((_inputMode === InputModes.Packet || _inputMode === InputModes.TransitionToSeadragon) && _keyboardUserTryingToPan(keyDownDirection)) {
				_packetViewer.stopSnappingToCamera();
				_packetViewer.resetAnimateTimer();
				setInputMode(InputModes.Packet);
				_keyboardDelta = new THREE.Vector2(0, 0);
			}

			//TODO: figure out other modes

			//TODO: if the current mode is an animation, then determine an appropriate initial velocity to avoid jarring stair step motions.

			startAnimationLoop();
		}

		return wasUsed;
	}

	function onKeyUp(e) {

		var wasUsed = _options.onKeyUp(e);

		wasUsed |= _keyboardVelocity.keyUp(e);

		return wasUsed;
	}

	function _keyboardUserTryingToPan(keyDownDirection) {
		return keyDownDirection.x !== 0 || keyDownDirection.y !== 0;
	}

	function quarticInterpolate(x) {
		var x0  = x - 1;
		var xSq = (x0 * x0);

		return 1 - (xSq * xSq);
	}

	function startAnimationLoop() {
		if (!_animationLoopRunning) {
			_animationLoopRunning = true;
			_prevUpdate = Date.now();
			requestAnimationFrame(_animationLoop);
		}
	}

	function _animationLoop() {

		if (!_animationLoopRunning) {
			return;
		}

		var now = Date.now();
		var timeDelta = now - _prevUpdate;
		_keyboardVelocity.update();
		var velocity = _keyboardVelocity.getVelocity();
		var keyDownDirection = _keyboardVelocity.getKeydownDirection();

		var keepLoopRunning = false;

		if (_inputMode === InputModes.TransitionToSeadragon) {
			if (_keyboardUserTryingToPan(keyDownDirection)) {
				setInputMode(InputModes.Packet);
			}
			else if (keyDownDirection.z !== 0 && seadragonAvailable()) {
				setInputMode(InputModes.Seadragon);
			}
		}

		if (_inputMode === InputModes.Packet) {
			_packetViewer.setContainerTransform(0, 0, 1);

			if (_inertiaGoing) {
				_inertiaVelocity *= Math.pow(_options.inertiaDampingPerMS, timeDelta);

				var timeFactor = (now - _inertiaStartTime) / _inertiaDuration;
				var position;

				if (timeFactor < 1) {

					_inertiaPos += (_inertiaVelocity * timeDelta);

					var interpolatedTimeFactor = quarticInterpolate(timeFactor);
					var invTimeFactor   = 1 - interpolatedTimeFactor;
					var quarticPosition = (invTimeFactor * _inertiaStartPos) + (interpolatedTimeFactor * _inertiaEndPos);

					position = (invTimeFactor * _inertiaPos) + (interpolatedTimeFactor * quarticPosition);
					position = _path.fixRange(position);
					keepLoopRunning = true;

					setPosition(position);

				}
				else {
					//Reach the end of the inertia.  Snap to camera to ensure we're perfectly aligned and trigger seadragon to become visible
					setInputMode(InputModes.TransitionToSeadragon);
					_packetViewer.snapToCamera(_inertiaEndCamera, { duration: 100 });
					_packetViewer.dataset.path.removePersistentVirtualPath();

					_inertiaGoing = false;
				}
			}
			else {
				//TODO: find a better way to calculate speedfactor
				var speedFactor = 0.3; //magic number.  Find a better way to calculate this
				var deltaX = speedFactor * -velocity.x * timeDelta / 1000;
				var deltaY = speedFactor * -velocity.y * timeDelta / 1000;

				_keyboardDelta.x += deltaX;
				_keyboardDelta.y += deltaY;
				var position = _getDelta(_keyboardDelta) * _pathLength + _currentArcPosition;

				if (!_keyboardUserTryingToPan(keyDownDirection)) {
					position = _path.fixRange(position);
					var closestCamera = _packetViewer.dataset.path.getClosestCamera(position, true);

					if (_keyboardPrevSnapCamera !== null) {
						var epsilon = 0.5;

						if (closestCamera.qIndex < position) {
							//Moving in the negative direction

							if (closestCamera.qIndex >= _keyboardPrevSnapCamera.qIndex) {
								//We need to snap past the prev camera
								position = _keyboardPrevSnapCamera.qIndex - epsilon;
								position = _path.fixRange(position);
								closestCamera = _packetViewer.dataset.path.getClosestCamera(position, true);

							}
						}
						else if (closestCamera.qIndex > position) {
							//Moving in the positive direction

							if (closestCamera.qIndex <= _keyboardPrevSnapCamera.qIndex) {
								//We need to snap past the prev camera
								position = _keyboardPrevSnapCamera.qIndex + epsilon;
								position = _path.fixRange(position);
								closestCamera = _packetViewer.dataset.path.getClosestCamera(position, true);
							}
						}
					}

					setInputMode(InputModes.TransitionToSeadragon);
					_packetViewer.snapToCamera(closestCamera);
					//TODO: null out this camera on any gesture or maybe when the animation completes
					_keyboardPrevSnapCamera = closestCamera;
					keepLoopRunning = false;
				}
				else {
					keepLoopRunning = true;

					if (position !== _path.fixRange(position)) {
						//At/past the end.  Clear the prev snap camera because we've jumped from one end to the other.
						_keyboardPrevSnapCamera = null;
					}

					setPosition(position);
				}
			}
		}
		else if (_inputMode === InputModes.Seadragon) {
			if (keyDownDirection.isZero()) {
				_applyConstraints();
				velocity.x = 0;
				velocity.y = 0;
				velocity.z = 0;
				keepLoopRunning = false;
			}
			else {
				var x = _inputElem.clientWidth / 2;
				var y = _inputElem.clientHeight / 2;

				var refPoint = _getRefPoint(x, y);

				//TODO: magic number.  Figure out how to represent this better.
				var keyboardZoomConstant = 1.002; //Amount to multiply by the zoom per millisecond
				var keyboardPanConstant  = 0.5;   //pixels per millisecond

				var deltaX = keyDownDirection.x * timeDelta * keyboardPanConstant;
				var deltaY = keyDownDirection.y * timeDelta * keyboardPanConstant;
				var zoomFactor = Math.pow(keyboardZoomConstant, timeDelta * keyDownDirection.z);

				_seadragonViewer.openSeadragon.viewport.panBy(_seadragonViewer.openSeadragon.viewport.deltaPointsFromPixels(new OpenSeadragon.Point(deltaX, deltaY)), true);
				_seadragonViewer.openSeadragon.viewport.zoomBy(zoomFactor, refPoint, false);

				_applyLooseConstraints();

				keepLoopRunning = true;
			}
		}

		if (keepLoopRunning) {
			requestAnimationFrame(_animationLoop);
			_prevUpdate = now;
		}
		else {
			//TODO: do we need _animationLoopRunning or can we just check the update time for null?
			_animationLoopRunning = false;
			_prevUpdate = null;
			velocity.x = 0;
			velocity.y = 0;
			velocity.z = 0;
		}
	}
};
