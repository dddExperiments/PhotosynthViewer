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

	Photosynth.EventDispatcher:
	--------------------------

	The general idea is that the event dispatcher is hooked to all callbacks of a class and forward to all registered callbacks.
	Then you can used addEventListener/removeEventListener which is more convenient for 3rd party development
*/

Photosynth.EventDispatcher = function(eventNames) {

	this.events = {};
	this.eventNames = eventNames;

	this.addEventListener = function(eventName, callback) {
		if (!this.isValidEvent(eventName)) {
			console.warn("\"" + eventName + "\" is not a supported event");
		}
		else {
			if (!this.events[eventName]) {
				this.events[eventName] = [];
			}
			this.events[eventName].push(callback);
		}
	};

	this.removeEventListener = function(eventName, callback) {
		if (!this.isValidEvent(eventName)) {
			console.warn("\"" + eventName + "\" is not a supported event");
		}
		else {
			if (!this.events[eventName]) {
				console.warn("callback not found for this event");
			}
			else {
				var callbacks = this.events[eventName];
				var index = callbacks.indexOf(callback);
				if (index !== -1) {
					callbacks.splice(index, 1);
				}
				else {
					console.warn("callback not found for this event");
				}
			}
		}
	};

	this.isValidEvent = function(eventName) {
		return this.eventNames.indexOf(eventName) !== -1;
	};

	this.toArray = function(a) {
		return Array.prototype.slice.call(a);
	};

	this.fireCallbacks = function(eventName, args) {
		var returnValue = true;
		var callbacks = this.events[eventName];
		if (callbacks) {
			for (var i=0; i<callbacks.length; ++i) {
				returnValue &= callbacks[i].apply(null, args);
			}
		}
		return returnValue;
	};
};
