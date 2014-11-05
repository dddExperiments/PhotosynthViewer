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

	PS.Packet.MultiTouchGestureHandler:
	-----------------------------------
	The intent of this class is to encapsulate various forms of touch and mouse input supported by different browsers.
	And then fire a consistent set of events that can be used to control a camera.

	Note:
		Instantiate it with an input element and options.
		The events are modelled after IE 10 events:
			gestureStart - pointerCount, layerX/Y (with respect to the input element), clientX/Y
			gestureChange - translationX/Y, layerX/Y , clientX/Y, scale
			gestureEnd - translationX/Y, layerX/Y , clientX/Y, scale, pointersStillDown
			discreteZoom - direction (positive value means zoom in), layerX/Y , clientX/Y
			keyDown
			keyUp

*/

/* global MSGesture */

PS.Packet.MultiTouchGestureHandler = function (elem, options) {

	var _elem = elem;

	var _options = {
		gestureStart:  function() {},
		gestureChange: function() {},
		gestureEnd:    function() {},
		discreteZoom:  function() {},
		keyDown:       function() {},
		keyUp:         function() {},
		onLog:         function() {}
	};
	PS.extend(_options, options);

	var enabled = false;
	var msGesture;
	var _isUserUsingTouch = false;
	var _that = this;

	function onGestureStart(e) {
		e.type = 'gestureStart';
		_options.gestureStart(e);
	}

	function onGestureChange(e) {
		e.type = 'gestureChange';
		_options.gestureChange(e);
	}

	function onGestureEnd(e) {
		e.type = 'gestureEnd';
		_options.gestureEnd(e);

		keyboardFocusElement.focus();
	}

	function onDiscreteZoom(e) {
		e.type = 'discreteZoom';
		_options.discreteZoom(e);
	}

	function onKeyDown(e) {
		if (_options.keyDown(e)) {
			e.preventDefault();
		}
	}

	function onKeyUp(e) {
		if (_options.keyUp(e)) {
			e.preventDefault();
		}
	}

	var msPointerCount = 0;

	function _getLayerXY(e) {
		//TODO: Possible perf improvement here:
		//		Walk up tree once then store result.  Will also need to set up (and later tear down) events
		//		to notify when the tree or scroll or offset has changed of any ancestors.

		//Note: Even if the event contains layerX/Y, we cannot use them because the mouseMove events are bound to the document rather than the input element.
		//		This was done to ensure the view continues to update if the user drags from inside the viewer to outside of the viewer.

		//Walk up tree to calculate offset from clientX/Y values
		var offsetX = 0;
		var offsetY = 0;
		var offsetElem = _elem;

		var fullscreenElem = document.fullscreenElement || document.msFullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;

		while (offsetElem !== null && offsetElem !== fullscreenElem && !isNaN(offsetElem.offsetLeft) && !isNaN(offsetElem.offsetTop)) {
			if (offsetElem === document.body) {
				offsetX += offsetElem.offsetLeft - document.documentElement.scrollLeft;
				offsetY += offsetElem.offsetTop  - document.documentElement.scrollTop;
			}
			else {
				offsetX += offsetElem.offsetLeft - offsetElem.scrollLeft;
				offsetY += offsetElem.offsetTop  - offsetElem.scrollTop;
			}
			offsetElem = offsetElem.offsetParent;
		}

		var layerX = e.clientX - offsetX;
		var layerY = e.clientY - offsetY;

		return { x: layerX, y: layerY };
	}

	function msPointerDown(e) {
		//for IE10, we have to tell the gesture engine which pointers to use (all of them for our uses).
		try {

			if (!_isUserUsingTouch && e.pointerType === "touch") {
				_options.onLog({type: "Stats", time: 0, label: "touch"});
				_isUserUsingTouch = true;
			}

			msGesture.addPointer(e.pointerId);
			_elem.msSetPointerCapture(e.pointerId);

			var layerXY = _getLayerXY(e);

			msPointerCount++;

			if (msPointerCount > 1) {
				onGestureEnd({
					layerX:  layerXY.x,
					layerY:  layerXY.y,
					screenX: e.screenX,
					screenY: e.screenY,
					translationX: totalTranslationX,
					translationY: totalTranslationY,
					scale: totalScale,
					pointersStillDown: true
				});

			}

			onGestureStart({
				layerX:  layerXY.x,
				layerY:  layerXY.y,
				screenX: e.screenX,
				screenY: e.screenY,
				pointerCount: msPointerCount,
				originalEvent: e
			});

			totalTranslationX = 0;
			totalTranslationY = 0;
			totalScale = 1;
		} catch (err) {
			// err.code === 11, "InvalidStateError" happens when touch and click happens at the same time.
		}
	}

	function msPointerUp(e) {
		msPointerCount--;

		if (msPointerCount < 0) {
			//This can happen if the user drags a pointer/finger from outside the viewer into the viewer, then releases
			msPointerCount = 0;
		}

		var layerXY = _getLayerXY(e);

		//TODO: do we still want to use msPointerCount?  It causes an extra GestureStart/End to be fired on mouse up
		var pointersStillDown = msPointerCount > 0;

		onGestureEnd({
			layerX:  layerXY.x,
			layerY:  layerXY.y,
			screenX: e.screenX,
			screenY: e.screenY,
			translationX: totalTranslationX,
			translationY: totalTranslationY,
			scale: totalScale,
			pointersStillDown: pointersStillDown
		});

		if (pointersStillDown) {
			onGestureStart({
				layerX:  layerXY.x,
				layerY:  layerXY.y,
				screenX: e.screenX,
				screenY: e.screenY,
				pointerCount: msPointerCount
			});

			totalTranslationX = 0;
			totalTranslationY = 0;
			totalScale = 1;
		}
	}

	var totalTranslationX;
	var totalTranslationY;
	var totalScale;

	function msGestureChange(e) {
		if (msPointerCount > 0) {
			totalTranslationX += e.translationX;
			totalTranslationY += e.translationY;
			totalScale *= e.scale;

			var layerXY = _getLayerXY(e);

			if (e.detail & e.MSGESTURE_FLAG_INERTIA) {
				//inertia phase

				onGestureEnd({
					layerX:  layerXY.x,
					layerY:  layerXY.y,
					screenX: e.screenX,
					screenY: e.screenY,
					translationX: totalTranslationX,
					translationY: totalTranslationY,
					scale: totalScale
				});
			}
			else {
				onGestureChange({
					layerX:  layerXY.x,
					layerY:  layerXY.y,
					screenX: e.screenX,
					screenY: e.screenY,
					translationX: totalTranslationX,
					translationY: totalTranslationY,
					scale: totalScale
				});
			}
		}
	}

	function msGestureEnd(e) {
		if (msPointerCount > 0) {
			var layerXY = _getLayerXY(e);

			onGestureEnd({
				layerX:  layerXY.x,
				layerY:  layerXY.y,
				screenX: e.screenX,
				screenY: e.screenY,
				translationX: totalTranslationX,
				translationY: totalTranslationY,
				scale: totalScale
			});
		}
	}

	var mouseDownPos = null;

	function mouseDown(e) {
		var layerXY = _getLayerXY(e);

		onGestureStart({
			layerX:  layerXY.x,
			layerY:  layerXY.y,
			screenX: e.screenX,
			screenY: e.screenY,
			pointerCount: 1,
			originalEvent: e
		});

		mouseDownPos = {
			x: layerXY.x,
			y: layerXY.y
		};

		e.preventDefault();

		document.addEventListener('mousemove', mouseMove, false);
		document.addEventListener('mouseup', mouseUp, false);
	}

	function mouseMove(e) {
		if (mouseDownPos !== null) {
			var layerXY = _getLayerXY(e);

			onGestureChange({
				layerX:  layerXY.x,
				layerY:  layerXY.y,
				screenX: e.screenX,
				screenY: e.screenY,
				translationX: layerXY.x - mouseDownPos.x,
				translationY: layerXY.y - mouseDownPos.y,
				scale: 1,
				originalEvent: e
			});

			e.preventDefault();
		}
	}

	function mouseUp(e) {
		if (mouseDownPos !== null) {
			var layerXY = _getLayerXY(e);

			onGestureEnd({
				layerX:  layerXY.x,
				layerY:  layerXY.y,
				screenX: e.screenX,
				screenY: e.screenY,
				translationX: layerXY.x - mouseDownPos.x,
				translationY: layerXY.y - mouseDownPos.y,
				scale: 1,
				originalEvent: e
			});

			mouseDownPos = null;

			e.preventDefault();

			document.removeEventListener('mousemove', mouseMove, false);
			document.removeEventListener('mouseup', mouseUp, false);
		}
	}

	function mouseWheel(e) {
		//Get the wheel data in a browser-agnostic way.
		//See http://www.switchonthecode.com/tutorials/javascript-tutorial-the-scroll-wheel
		var wheelDelta =  e.detail ? e.detail * -1 : e.wheelDelta / 40;

		var direction;
		if (wheelDelta > 0) {
			direction = 1;
		}
		else if (wheelDelta < 0) {
			direction = -1;
		}

		var layerXY = _getLayerXY(e);

		onDiscreteZoom({
			layerX:  layerXY.x,
			layerY:  layerXY.y,
			screenX: e.screenX,
			screenY: e.screenY,
			direction: direction
		});

		e.preventDefault();
	}

	function doubleClick(e) {
		var layerXY = _getLayerXY(e);

		onDiscreteZoom({
			layerX:  layerXY.x,
			layerY:  layerXY.y,
			screenX: e.screenX,
			screenY: e.screenY,
			direction: 1
		});

		e.preventDefault();
	}

	var touchStartPos  = null;
	var touchStartDist = null;
	var touchLastEvent = null;
	var touchesInUse = { primary: null, secondary: null };

	//sets the first two touches in the list to be primary and secondary
	function setCurrentTouchPair(touches) {
		if (touches.length === 0) {
			touchesInUse = { primary: null, secondary: null };
		}
		else if (touches.length === 1) {
			touchesInUse = { primary: touches[0].identifier, secondary: null };
		}
		else {
			touchesInUse = { primary: touches[0].identifier, secondary:touches[1].identifier };
		}
	}

	function getCurrentTouchPair(touches) {
		if (touchesInUse === null) {
			return null;
		}

		var touchPair = { primary: null, secondary: null };

		for (var i = 0; i < touches.length; i++) {
			var touch = touches[i];

			if (touch.identifier === touchesInUse.primary) {
				touchPair.primary = touch;
				touchPair.primary.layerXY = _getLayerXY(touch);
			}
			else if (touch.identifier === touchesInUse.secondary) {
				touchPair.secondary = touch;
				touchPair.secondary.layerXY = _getLayerXY(touchPair.secondary);
			}

			if (touchPair.primary !== null && touchPair.secondary !== null) {
				//early exit
				return touchPair;
			}
		}

		return touchPair;
	}

	function calculateTouchPairEventArgs(touchPair, includeMoveArgs) {
		var primary   = touchPair.primary;
		var secondary = touchPair.secondary;

		var layerX  = (primary.layerXY.x + secondary.layerXY.x) / 2;
		var layerY  = (primary.layerXY.y + secondary.layerXY.y) / 2;
		var screenX = (primary.screenX + secondary.screenX) / 2;
		var screenY = (primary.screenY + secondary.screenY) / 2;

		var deltaX = primary.layerXY.x - secondary.layerXY.x;
		var deltaY = primary.layerXY.y - secondary.layerXY.y;

		var touchDist = Math.sqrt((deltaX * deltaX) + (deltaY * deltaY));

		var eventArgs = {
			layerX:  layerX,
			layerY:  layerY,
			screenX: screenX,
			screenY: screenY,
			pointerCount: (touchPair.secondary === null) ? 1 : 2
		};

		if (includeMoveArgs) {
			eventArgs.translationX = layerX - touchStartPos.x;
			eventArgs.translationY = layerY - touchStartPos.y;
			eventArgs.scale = touchDist / touchStartDist;
		}
		else {
			touchStartPos = { x: layerX, y: layerY };
			touchStartDist = touchDist;
		}

		return eventArgs;
	}

	function onTouchGestureStart(e) {
		onGestureStart(e);

		touchLastEvent = e;
		touchLastEvent.translationX = 0;
		touchLastEvent.translationY = 0;
		touchLastEvent.scale = 1;
	}

	function onTouchGestureChange(e) {
		onGestureChange(e);
		touchLastEvent = e;
	}

	function onTouchGestureEnd(e, pointersStillDown) {
		e.pointersStillDown = pointersStillDown;
		onGestureEnd(e);
	}

	function touchStart(e) {
		e.preventDefault();

		if (e.targetTouches.length === 1) {
			//first finger down

			setCurrentTouchPair(e.targetTouches);
			var touchPair = getCurrentTouchPair(e.targetTouches);

			onTouchGestureStart({
				layerX:  touchPair.primary.layerXY.x,
				layerY:  touchPair.primary.layerXY.y,
				screenX: touchPair.primary.screenX,
				screenY: touchPair.primary.screenY,
				pointerCount: (touchPair.secondary === null) ? 1 : 2
			});

			touchStartPos = {
				x: touchPair.primary.layerXY.x,
				y: touchPair.primary.layerXY.y
			};
		}
		else if (e.targetTouches.length === 2) {
			//second finger down

			var touchPair = getCurrentTouchPair(e.targetTouches);

			onTouchGestureEnd(touchLastEvent, true);

			setCurrentTouchPair(e.targetTouches);
			touchPair = getCurrentTouchPair(e.targetTouches);

			onTouchGestureStart(calculateTouchPairEventArgs(touchPair, false));
		}
	}

	function touchMove(e) {
		e.preventDefault();

		if (!_isUserUsingTouch) {
			_options.onLog({type: "Stats", time: 0, label: "touch"});
			_isUserUsingTouch = true;
		}

		var touchPair = getCurrentTouchPair(e.targetTouches);

		if (touchPair.secondary === null) {
			//one finger

			onTouchGestureChange({
				layerX:       touchPair.primary.layerXY.x,
				layerY:       touchPair.primary.layerXY.y,
				screenX:      touchPair.primary.screenX,
				screenY:      touchPair.primary.screenY,
				translationX: touchPair.primary.layerXY.x - touchStartPos.x,
				translationY: touchPair.primary.layerXY.y - touchStartPos.y,
				scale: 1
			});
		}
		else {
			//two fingers

			onTouchGestureChange(calculateTouchPairEventArgs(touchPair, true));
		}
	}

	function touchEnd(e) {
		e.preventDefault();

		if (e.targetTouches.length === 0) {
			//last finger up

			setCurrentTouchPair(e.targetTouches);

			onTouchGestureEnd(touchLastEvent);

			touchStartPos = null;
			touchStartDist = null;
			//touchLastEvent = null;
		}
		else if (e.targetTouches.length === 1) {
			//second finger up

			onTouchGestureEnd(touchLastEvent, true);

			setCurrentTouchPair(e.targetTouches);
			var touchPair = getCurrentTouchPair(e.targetTouches);

			var primaryTouch = touchPair.primary;

			onTouchGestureStart({
				layerX:  primaryTouch.layerXY.x,
				layerY:  primaryTouch.layerXY.y,
				screenX: primaryTouch.screenX,
				screenY: primaryTouch.screenY,
				pointerCount: (touchPair.secondary === null) ? 1 : 2
			});

			touchStartPos = {
				x: primaryTouch.layerXY.x,
				y: primaryTouch.layerXY.y
			};
		}
		else {
			//one finger out of 3+ lifted up

			var currentTouches = getCurrentTouchPair(e.targetTouches);

			if (currentTouches.primary === null || currentTouches.secondary === null) {
				//the primary or secondary finger was lifted.  Finish this gesture and start a new one.

				onTouchGestureEnd(touchLastEvent, true);

				setCurrentTouchPair(e.targetTouches);
				var touchPair = getCurrentTouchPair(e.targetTouches);

				onTouchGestureStart(calculateTouchPairEventArgs(touchPair, false));
			}
		}
	}

	var attachHandlers;
	var detachHandlers;

	if (window.navigator.msPointerEnabled && window.MSGesture) {
	//IE10+.  Mouse, touch, and pen events all fire as MSPointer and MSGesture
		attachHandlers = function () {
			msGesture = new MSGesture();
			msGesture.target = _elem;

			_elem.addEventListener("MSPointerDown",   msPointerDown, false);
			_elem.addEventListener("MSPointerUp",     msPointerUp, false);
			_elem.addEventListener('MSGestureChange', msGestureChange, true);
			_elem.addEventListener('MSGestureEnd',    msGestureEnd, true);
			_elem.addEventListener('dblclick',        doubleClick, false);
			_elem.addEventListener('mousewheel',      mouseWheel, false);
		};

		detachHandlers = function () {
			_elem.removeEventListener("MSPointerDown",   msPointerDown, false);
			_elem.removeEventListener("MSPointerUp",     msPointerUp, false);
			_elem.removeEventListener('MSGestureChange', msGestureChange, true);
			_elem.removeEventListener('MSGestureEnd',    msGestureEnd, true);
			_elem.removeEventListener('dblclick',        doubleClick, false);
			_elem.removeEventListener('mousewheel',      mouseWheel, false);

			msGesture = null;
		};

	}
	else {
		//Browser doesn't support MSPointer and MSGesture, fall back to wc3 touch and mouse events
		attachHandlers = function () {
			_elem.addEventListener('touchstart', touchStart, false);
			_elem.addEventListener('touchmove',  touchMove, false);
			_elem.addEventListener('touchend',   touchEnd, false);

			_elem.addEventListener('mousedown',      mouseDown, false);
			_elem.addEventListener('mousewheel',     mouseWheel, false);
			_elem.addEventListener('DOMMouseScroll', mouseWheel, false);
			_elem.addEventListener('dblclick',      doubleClick, false);

			if (window.parent && window !== window.parent) {
				//If we're in a frame or iframe, then we won't get proper events when the mouse goes outside the frame, so just count it as a mouseup.
				document.addEventListener('mouseout', mouseUp, false);
			}
		};

		detachHandlers = function () {
			_elem.removeEventListener('touchstart', touchStart, false);
			_elem.removeEventListener('touchmove',  touchMove, false);
			_elem.removeEventListener('touchend',   touchEnd, false);

			_elem.removeEventListener('mousedown', mouseDown, false);

			//Note: mousemove and mouseup are attached from the mousedown handler; not the attacheHandlers function.
			//	  But we still disable them here in case they are attached.
			document.removeEventListener('mousemove', mouseMove, false);
			document.removeEventListener('mouseup',   mouseUp, false);

			_elem.removeEventListener('mousewheel',     mouseWheel, false);
			_elem.removeEventListener('DOMMouseScroll', mouseWheel, false);
			_elem.removeEventListener('dblclick',       doubleClick, false);

			if (window.parent && window !== window.parent) {
				document.removeEventListener('mouseout', mouseUp, false);
			}
		};
	}

	var keyboardFocusElement = document.createElement('input');
	keyboardFocusElement.readOnly = true;
	keyboardFocusElement.style.width = "0px";
	keyboardFocusElement.style.height = "0px";
	keyboardFocusElement.style.opacity = 0;

	function attachKeyboardHandlers() {
		_elem.appendChild(keyboardFocusElement);

		keyboardFocusElement.addEventListener('keydown', onKeyDown, false);
		keyboardFocusElement.addEventListener('keyup',   onKeyUp, false);
		keyboardFocusElement.focus();
	}

	function detachKeyboardHandlers() {
		keyboardFocusElement.removeEventListener('keydown', onKeyDown, false);
		keyboardFocusElement.removeEventListener('keyup',   onKeyUp, false);

		if (keyboardFocusElement.parentNode) {
			keyboardFocusElement.parentNode.removeChild(keyboardFocusElement);
		}
	}

	//keeping the keyboard handler active all the time (used for c,m,f,42) instead of only in smooth mode
	attachKeyboardHandlers();

	//public interface
	this.enable = function () {
		attachHandlers();
		enabled = true;
	};

	this.disable = function () {
		detachHandlers();
		enabled = false;
	};

	this.destroy = function() {
		_that.disable();
		detachKeyboardHandlers();
	};

	this.isEnabled = function () {
		return enabled;
	};

	this.userCurrentlyInteracting = function () {
		//Intentionally exclude keyboard and mouse input.  Only care about touch input here.
		return msPointerCount > 0;
	};

	this.focusKeyboardElement = function () {
		keyboardFocusElement.focus();
	};

	this.blurKeyboardElement = function() {
		keyboardFocusElement.blur();
	};
};
