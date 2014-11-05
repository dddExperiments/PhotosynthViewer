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

	Based on MooTools: http://mootools.net/ (MIT-style license)
	https://github.com/mootools/mootools-core/blob/master/Source/Fx/Fx.Transitions.js

*/

PS.Fx = {};

PS.Fx.Tween = function(options) {

	var _options = {
		duration: 300,
		transition: PS.Fx.Transitions.Expo.easeOut,
		from: 0,
		to: 1,
		onStart: function() {},
		onUpdate: function() {},
		onComplete: function() {}
	};
	PS.extend(_options, options);

	var _startTime, _endTime, _request, _range;
	var _started   = false;
	var _completed = false;
	var _stopped   = false;

	function update() {
		var now = Date.now();

		if (now > _endTime) {
			_completed = true;
			_stopped   = true;
			_options.onUpdate(_options.to, 1);
			_options.onComplete(_options.to, 1);
			return;
		}
		else {
			var xpercent = (now -_startTime)/_options.duration;
			var ypercent = _options.transition(xpercent);
			_options.onUpdate(_range*ypercent+_options.from, ypercent, xpercent);
			_request = window.requestAnimationFrame(update);
		}
	}

	this.start = function() {

		if (_started) {
			return;
		}
		_startTime = Date.now();
		_endTime   = _startTime + _options.duration;
		_range     = _options.to - _options.from;
		_request   = window.requestAnimationFrame(update);
		_started   = true;
		_completed = false;
		_stopped   = false;
		_options.onStart(_options.from, 0);
		_options.onUpdate(_options.from, 0);

		return this;
	};

	this.stop = function() {
		_stopped = true;
		if (_started) {
			window.cancelAnimationFrame(_request);
		}

		return this;
	};

	this.running = function() {
		return _started && !_stopped && !_completed;
	};

	this.done = function() {
		return _completed;
	};

	this.stopped = function() {
		return _stopped;
	};
};

PS.Fx.Transitions = (function() {

	var _interpolators = {
		Linear: function(p) {
			return p;
		},

		Pow: function(p, x) {
			return Math.pow(p, x || 6);
		},

		Expo: function(p) {
			return Math.pow(2, 8 * (p - 1));
		},

		Circ: function(p) {
			return 1 - Math.sin(Math.acos(p));
		},

		Sine: function(p) {
			return 1 - Math.cos(p * Math.PI / 2);
		},

		Back: function(p, x) {
			x = x || 1.618;
			return Math.pow(p, 2) * ((x + 1) * p - x);
		},

		Bounce: function(p) {
			var value;
			for (var a = 0, b = 1; 1; a += b, b /= 2){
				if (p >= (7 - 4 * a) / 11){
					value = b * b - Math.pow((11 - 6 * a - 11 * p) / 4, 2);
					break;
				}
			}
			return value;
		},

		Elastic: function(p, x) {
			return Math.pow(2, 10 * --p) * Math.cos(20 * p * Math.PI * (x || 1) / 3);
		}
	};

	["Quad", "Cubic", "Quart", "Quint"].forEach(function(name, index) {
		_interpolators[name] = (function() {
				var power = index+2;
				return function(p) {
					return Math.pow(p, power);
				};
		})();
	});

	var _transitions = {};

	//jshint loopfunc: true
	for (var name in _interpolators) {
		if (_interpolators.hasOwnProperty(name)) {
			_transitions[name] = (function() {
				var interpolator = _interpolators[name];
				return {
					easeIn: function(p) {
						return interpolator(p);
					},
					easeOut: function(p) {
						return 1 - interpolator(1 - p);
					},
					easeInOut: function(p) {
						return (p <= 0.5 ? interpolator(2 * p) : (2 - interpolator(2 * (1 - p)))) / 2;
					}
				};
			})();
		}
	}
	//jshint loopfunc: false

	return _transitions;
})();
