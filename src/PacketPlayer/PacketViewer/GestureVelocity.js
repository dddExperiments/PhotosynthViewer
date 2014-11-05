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

PS.Packet.GestureVelocity = function() {
	var _prevTime = null;
	var _prevTranslationX = 0;
	var _prevTranslationY = 0;
	var _velocity = null;
	var _changeCount = 0;
	var _pointerCount;

	//const
	var MaxChanges = 5;

	this.onGestureStart = function (e) {
		_prevTime = Date.now();
		_prevTranslationX = 0;
		_prevTranslationY = 0;
		_velocity = {
			x: 0,
			y: 0
		};
		_changeCount = 0;

		_pointerCount = e.pointerCount;
	};

	var VelocityResetHoldTime = 100;

	function updateVelocity(e) {
		var now = Date.now();
		var timeDelta = now - _prevTime;
		var translationX = e.translationX - _prevTranslationX;
		var translationY = e.translationY - _prevTranslationY;

		if (timeDelta === 0) {
			//No time has passed.  Do nothing
			return;
		}

		if (_velocity === null) {
			return;
		}

		if (timeDelta > VelocityResetHoldTime) {
			_velocity.x = 0;
			_velocity.y = 0;
		}

		var instantaneousVelocity = {
			x: translationX / timeDelta,
			y: translationY / timeDelta
		};

		_velocity.x = ((_velocity.x * _changeCount) + instantaneousVelocity.x) / (_changeCount + 1);
		_velocity.y = ((_velocity.y * _changeCount) + instantaneousVelocity.y) / (_changeCount + 1);

		_changeCount++;
		if (_changeCount > MaxChanges) {
			_changeCount = MaxChanges;
		}

		_prevTime = Date.now();
		_prevTranslationX = e.translationX;
		_prevTranslationY = e.translationY;
	}

	this.onGestureChange = function (e) {
		updateVelocity(e);
	};

	this.onGestureEnd = function (e) {
		updateVelocity(e);

		if (_velocity === null || _pointerCount !== 1 || e.pointersStillDown || _changeCount === 0) {
			return {
				x: 0,
				y: 0
			};
		}
		else {
			return {

				x: _velocity.x,
				y: _velocity.y
			};
		}
	};

};
