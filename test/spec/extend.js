"use strict";

describe("extend for copy", function () {
	it("copy options", function () {

		var a = {
			magic: 42
		};

		var b = PS.extend({}, a);

		expect(b.magic).toBeDefined();
		expect(b.magic).toBe(42);
	});
});

describe("extend for copy 2 ", function () {
	it("copy options", function () {

		var a = {
			magic: 42
		};

		var b = PS.extend({}, a);

		expect(b.magic).toBeDefined();
		expect(b.magic).toBe(42);
	});
});
