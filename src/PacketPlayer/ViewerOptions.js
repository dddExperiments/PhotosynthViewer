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

	PS.Packet.ViewerOptions:
	------------------------
	- the purpose of this object is to store and override options passed to the viewer using Html5 localStorage.
	- it's used used by the hidden 42 menu

*/

PS.Packet.ViewerOptions = {};

PS.Packet.ViewerOptions.getLocalStorageName = function() {
	return "PSPacketViewerOptions_v1";
};

PS.Packet.ViewerOptions.getDefault = function() {
	var settings = {
		viewer: { //laptop GPU
			maxRenderSize:     1024*768,
			maxHDPixels:       720*576,
			gpuHDMemoryBudget: 80
		}
	};
	return settings;
};

PS.Packet.ViewerOptions.getUser = function() {

	var default_settings = PS.Packet.ViewerOptions.getDefault();
	if (window.localStorage) {
		var saved_settings = JSON.parse(localStorage.getItem(PS.Packet.ViewerOptions.getLocalStorageName()) || "{}");
		PS.extend(default_settings, saved_settings);
	}
	return default_settings;

};

PS.Packet.ViewerOptions.override = function(options) {

	var currentOptions = PS.Packet.ViewerOptions.getUser();
	PS.extend(currentOptions, options);
	if (window.localStorage) {
		localStorage.setItem(PS.Packet.ViewerOptions.getLocalStorageName(), JSON.stringify(currentOptions));
	}
};

PS.Packet.ViewerOptions.reset = function() {
	if (window.localStorage) {
		localStorage.setItem(PS.Packet.ViewerOptions.getLocalStorageName(), "{}");
	}
};
