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

	PS.Packet.KeyboardVelocity:
	---------------------------
	This class is responsible for handling speed while using keyboard arrows to navigate.

	Note:
		Vector returned ranges from [-1, 1] in each axis.
		- Positive x : right
		- Positive y : down
		- Positive z : plus

		getKeydownDirection returns the direction based on the current keys down.
		getVelocity returns the current velocity.
		accelerationRate is in units per second.  Current behavior is to accelerate linearly.
*/



PS.Packet.KeyboardVelocity = function (accelerationRate) {

	function Vector3() {
		this.x = 0;
		this.y = 0;
		this.z = 0;

		this.isZero = function () {
			return this.x === 0 && this.y === 0 && this.z === 0;
		};
	}

	var _accelerationRate = accelerationRate;

	var _leftKey  = false,
		_rightKey = false,
		_upKey    = false,
		_downKey  = false,
		_plusKey  = false,
		_minusKey = false;

	var _keydownDirection = new Vector3();
	var _velocity = new Vector3();
	var _prevUpdateTime = null;

	function getKeyDirection(positiveKey, negativeKey) {
		if ((positiveKey && negativeKey) || (!positiveKey && !negativeKey)) {
			return 0;
		}
		else if (positiveKey) {
			return 1;
		}
		else {
			return -1;
		}
	}

	function updateKeydownDirection() {
		_keydownDirection.x = getKeyDirection(_rightKey, _leftKey);
		_keydownDirection.y = getKeyDirection(_downKey, _upKey);
		_keydownDirection.z = getKeyDirection(_plusKey, _minusKey);
	}

	function getTimeDelta(prev, current) {
		if (prev === null || current === null) {
			return 0;
		}

		return current - prev;
	}

	this.keyDown = function (e) {
		if (_keydownDirection.isZero() && _velocity.isZero()) {
			_prevUpdateTime = Date.now();
		}

		var wasUsed = false;

		if (e.keyCode === '37') {
			_leftKey = true;
			wasUsed  = true;
		}
		else if (e.keyCode === '38') {
			_upKey  = true;
			wasUsed = true;
		}
		else if (e.keyCode === '39') {
			_rightKey = true;
			wasUsed   = true;
		}
		else if (e.keyCode === '40') {
			_downKey = true;
			wasUsed  = true;
		}
		else if (e.keyCode === '107' || e.keyCode === '187') {
			//+ keypad or +/=
			_plusKey = true;
			wasUsed  = true;
		}
		else if (e.keyCode === '109' || e.keyCode === '189') {
			//- keypad or -/_
			_minusKey = true;
			wasUsed   = true;
		}

		updateKeydownDirection();

		return wasUsed;
	};

	this.keyUp = function (e) {

		var wasUsed = false;
		if (e.keyCode === '37') {
			_leftKey = false;
			wasUsed  = true;
		}
		else if (e.keyCode === '38') {
			_upKey  = false;
			wasUsed = true;
		}
		else if (e.keyCode === '39') {
			_rightKey = false;
			wasUsed   = true;
		}
		else if (e.keyCode === '40') {
			_downKey = false;
			wasUsed  = true;
		}
		else if (e.keyCode === '107' || e.keyCode === '187') {
			//+ keypad or +/=
			_plusKey = false;
			wasUsed  = true;
		}
		else if (e.keyCode === '109' || e.keyCode === '189') {
			//- keypad or -/_
			_minusKey = false;
			wasUsed   = true;
		}

		updateKeydownDirection();

		return wasUsed;
	};

	this.getKeydownDirection = function () {
		return _keydownDirection;
	};

	this.getVelocity = function () {
		return _velocity;
	};

	function clamp(val, min, max) {
		return Math.min(Math.max(val, min), max);
	}

	function updateVelocity(velocity, direction, velocityDelta) {
		var slowing = false;

		if (direction === 0) {
			if (velocity === 0) {

				return 0;
			}

			direction = (velocity < 0) ? 1 : -1;
			slowing = true;
		}

		var newVelocity = clamp(velocity + (direction * velocityDelta), -1, 1);

		if (slowing && Math.abs(newVelocity) < Math.abs(velocityDelta)) {
			return 0;
		}

		return newVelocity;
	}

	this.update = function () {
		var now = Date.now();
		var timeDelta = getTimeDelta(_prevUpdateTime, now);

		if (timeDelta !== 0) {
			var velocityDelta = _accelerationRate * timeDelta / 1000;
			_velocity.x = updateVelocity(_velocity.x, _keydownDirection.x, velocityDelta);
			_velocity.y = updateVelocity(_velocity.y, _keydownDirection.y, velocityDelta);
			_velocity.z = updateVelocity(_velocity.z, _keydownDirection.z, velocityDelta);
		}

		_prevUpdateTime = now;
	};

	this.updateNeeded = function () {
		return !_keydownDirection.isZero() || !_velocity.isZero();
	};

	this.anyKeysDown = function () {
		return !_keydownDirection.isZero();
	};
};
