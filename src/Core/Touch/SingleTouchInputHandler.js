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

	PS.Packet.SingleTouchInputHandler:
	----------------------------------
	This class is responsible for handling single touch event across all browsers.

*/

PS.Packet.InputType = {
	Mouse: "mouse",
	Touch: "touch"
};

PS.Packet.SingleTouchInputHandler = function(element, options) {

	//This class only handle 1 touch/click at a time

	var _element = element;
	var _options = {
		interpretOutAsUp: false,
		onDown: function() {},
		onMove: function() {},
		onUp:   function() {}
	};
	PS.extend(_options, options);


function getLayerXY(e) {
	//TODO: Possible perf improvement here:
	//		Walk up tree once then store result.  Will also need to set up (and later tear down) events
	//		to notify when the tree or scroll or offset has changed of any ancestors.

	//Note: Even if the event contains layerX/Y, we cannot use them because the mouseMove events are bound to the document rather than the input element.
	//		This was done to ensure the view continues to update if the user drags from inside the viewer to outside of the viewer.

	//Walk up tree to calculate offset from clientX/Y values
	var offsetX = 0;
	var offsetY = 0;
	var offsetElem = _element;

	var fullscreenElem = document.fullscreenElement || document.msFullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;

	while (offsetElem !== null && offsetElem !== fullscreenElem && !isNaN(offsetElem.offsetLeft) && !isNaN(offsetElem.offsetTop)) {

		if (offsetElem === document.body) {
				offsetX += offsetElem.offsetLeft - document.documentElement.scrollLeft;
				offsetY += offsetElem.offsetTop -  document.documentElement.scrollTop;
			}
			else {
				offsetX += offsetElem.offsetLeft - offsetElem.scrollLeft;
				offsetY += offsetElem.offsetTop - offsetElem.scrollTop;
			}
			offsetElem = offsetElem.offsetParent;
	}


		var layerX = e.clientX - offsetX;
		var layerY = e.clientY - offsetY;

		return { x: layerX, y: layerY };
	}


//IE specific input handling

	var _currentPointerId = null;

	function onPointerDown(e) {
		document.removeEventListener("MSPointerMove", onPointerMove, false);
		document.removeEventListener("MSPointerUp",   onPointerUp,   false);

		_currentPointerId = e.pointerId;
		var layerXY = getLayerXY(e);
		if (_options.onDown({
			type: e.pointerType === "mouse" ? PS.Packet.InputType.Mouse : PS.Packet.InputType.Touch,
			layerX: layerXY.x,
			layerY: layerXY.y,
			screenX: e.screenX,
			screenY: e.screenY,
			clientX: e.clientX,
			clientY: e.clientY,
			originalEvent: e
		})) {
			e.preventDefault();
			document.addEventListener("MSPointerMove", onPointerMove, false);
			document.addEventListener("MSPointerUp",   onPointerUp,   false);
		}
	}

	function onPointerMove(e) {
		if (e.pointerId === _currentPointerId) {
			var layerXY = getLayerXY(e);
			if (_options.onMove({
				type: e.pointerType === "mouse" ? PS.Packet.InputType.Mouse : PS.Packet.InputType.Touch,
				layerX: layerXY.x,
				layerY: layerXY.y,
				screenX: e.screenX,
				screenY: e.screenY,
				clientX: e.clientX,
				clientY: e.clientY,
				originalEvent: e
			})) {
				e.preventDefault();
			}
		}
	}

	function onPointerUp(e) {
		if (e.pointerId === _currentPointerId) {
			var layerXY = getLayerXY(e);
			if (_options.onUp({
				type: e.pointerType === "mouse" ? PS.Packet.InputType.Mouse : PS.Packet.InputType.Touch,
				layerX: layerXY.x,
				layerY: layerXY.y,
				screenX: e.screenX,
				screenY: e.screenY,
				clientX: e.clientX,
				clientY: e.clientY,
				originalEvent: e
			})) {
				e.preventDefault();
			}
		}
		document.removeEventListener("MSPointerMove", onPointerMove, false);
		document.removeEventListener("MSPointerUp",   onPointerUp,   false);
		_currentPointerId = null;
	}

//Mouse handling for chrome/firefox

	var _mouseWasDown = false;

	function onMouseDown(e) {

		_mouseWasDown = true;

		var layerXY = getLayerXY(e);
		if (_options.onDown({
			type: PS.Packet.InputType.Mouse,
			layerX: layerXY.x,
			layerY: layerXY.y,
			screenX: e.screenX,
			screenY: e.screenY,
			clientX: e.clientX,
			clientY: e.clientY,
			originalEvent: e
		})) {
			e.preventDefault();
		}

		document.addEventListener("mousemove", onMouseMove, false);
		document.addEventListener("mouseup",   onMouseUp,   false);
		if (_options.interpretOutAsUp) {
			document.addEventListener("mouseout",  onMouseUp,   false); //for iframe
		}
	}

	function onMouseMove(e) {
		if (_mouseWasDown) {
			var layerXY = getLayerXY(e);
			if (_options.onMove({
				type: PS.Packet.InputType.Mouse,
				layerX: layerXY.x,
				layerY: layerXY.y,
				screenX: e.screenX,
				screenY: e.screenY,
				clientX: e.clientX,
				clientY: e.clientY,
				originalEvent: e
			})) {
				e.preventDefault();
			}
		}
	}

	function onMouseUp(e) {
		if (_mouseWasDown) {
			var layerXY = getLayerXY(e);
			if (_options.onUp({
				type: PS.Packet.InputType.Mouse,
				layerX: layerXY.x,
				layerY: layerXY.y,
				screenX: e.screenX,
				screenY: e.screenY,
				clientX: e.clientX,
				clientY: e.clientY,
				originalEvent: e
			})) {
				e.preventDefault();
			}
		}
		_mouseWasDown = false;
		document.removeEventListener("mousemove", onMouseMove, false);
		document.removeEventListener("mouseup",   onMouseUp,   false);
	}


//Touch handling for chrome/firefox

	var _currentTouchId = null;

	function findTouch(e, id) {
		for (var i=0; i<e.changedTouches.length; ++i) {
			if (e.changedTouches[i].identifier === id) {
				return e.changedTouches[i];
			}
		}
		return null;
	}

	function cancelCurrentTouch() {
		_currentTouchId = null;
		document.removeEventListener("touchmove", onTouchMove, false);
		document.removeEventListener("touchend",  onTouchUp,   false);
	}

	function onTouchDown(e) {
		if (e.changedTouches.length === 1) {

			var firstTouch = e.changedTouches[0];
			_currentTouchId = firstTouch.identifier;

			var layerXY = getLayerXY(firstTouch);
			if (_options.onDown({
				type: PS.Packet.InputType.Touch,
				layerX: layerXY.x,
				layerY: layerXY.y,
				screenX: firstTouch.screenX,
				screenY: firstTouch.screenY,
				clientX: firstTouch.clientX,
				clientY: firstTouch.clientY,
				originalEvent: e
			})) {
				e.preventDefault();
			}

			document.addEventListener("touchmove", onTouchMove, false);
			document.addEventListener("touchend",  onTouchUp,   false);
		}
	}

	function onTouchMove(e) {
		var touch = findTouch(e, _currentTouchId);
		if (touch) {

			var layerXY = getLayerXY(touch);
			if (_options.onMove({
				type: PS.Packet.InputType.Touch,
				layerX: layerXY.x,
				layerY: layerXY.y,
				screenX: touch.screenX,
				screenY: touch.screenY,
				clientX: touch.clientX,
				clientY: touch.clientY,
				originalEvent: e
			})) {
				e.preventDefault();
			}
		}
		else {
			cancelCurrentTouch();
		}
	}

	function onTouchUp(e) {
		var touch = findTouch(e, _currentTouchId);
		if (touch) {

			var layerXY = getLayerXY(touch);
			if (_options.onUp({
				type: PS.Packet.InputType.Touch,
				layerX: layerXY.x,
				layerY: layerXY.y,
				screenX: touch.screenX,
				screenY: touch.screenY,
				clientX: touch.clientX,
				clientY: touch.clientY,
				originalEvent: e
			})) {
				e.preventDefault();
			}
		}
		cancelCurrentTouch();
	}

	var attachHandlers;
	var detachHandlers;

	if (window.navigator.msPointerEnabled) {
		//IE10+.  Mouse, touch, and pen events all fire as MSPointer and MSGesture
		attachHandlers = function () {
			_element.addEventListener("MSPointerDown", onPointerDown, false);
		};

		detachHandlers = function () {
			_element.removeEventListener("MSPointerDown", onPointerDown, false);
			document.removeEventListener("MSPointerMove", onPointerMove, false);
			document.removeEventListener("MSPointerUp",   onPointerUp,   false);
		};
	}
	else {
		//Browser doesn't support MSPointer, fall back to wc3 touch and mouse events
		attachHandlers = function () {
			_element.addEventListener('mousedown',  onMouseDown, false);
			_element.addEventListener('touchstart', onTouchDown, false);
		};

		detachHandlers = function () {
			_element.removeEventListener('mousedown', onMouseDown, false);
			document.removeEventListener('mousemove', onMouseMove, false);
			document.removeEventListener('mouseup',   onMouseUp,   false);
			if (_options.interpretOutAsUp) {
				document.removeEventListener('mouseout',  onMouseUp,   false);
			}

			_element.removeEventListener('touchstart', onTouchDown, false);
			document.removeEventListener('touchmove',  onTouchMove, false);
			document.removeEventListener('touchend',   onTouchUp,   false);
		};
	}

	attachHandlers();

	this.stop = function() {
		detachHandlers();
	};
};
