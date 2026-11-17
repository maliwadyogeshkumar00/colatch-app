import { test } from "node:test";
import assert from "node:assert/strict";
import { canMove, nextStatuses, cleanShipment, moveStamps, addressLines, ShipError, SHIP_STATUSES } from "@/lib/net/shipments";

test("shipments only move forward: pending → shipped → delivered / returned", () => {
  assert.ok(canMove("pending", "shipped"));
  assert.ok(canMove("shipped", "delivered"));
  assert.ok(canMove("shipped", "returned"));
  assert.ok(canMove("delivered", "returned"));
  for (const [a, b] of [["pending", "delivered"], ["pending", "returned"], ["delivered", "shipped"], ["returned", "shipped"], ["returned", "delivered"], ["shipped", "pending"], ["shipped", "shipped"], ["nope", "shipped"]]) {
    assert.equal(canMove(a, b), false, `${a} -> ${b}`);
  }
  assert.deepEqual(nextStatuses("returned"), []);
  assert.deepEqual([...SHIP_STATUSES], ["pending", "shipped", "delivered", "returned"]);
});

test("moving sets the right timestamp", () => {
  assert.deepEqual(moveStamps("shipped"), { shipped: true, delivered: false });
  assert.deepEqual(moveStamps("delivered"), { shipped: false, delivered: true });
  assert.deepEqual(moveStamps("returned"), { shipped: false, delivered: false });
});

test("the add form is validated", () => {
  assert.throws(() => cleanShipment({ product: "" }), ShipError);
  assert.throws(() => cleanShipment({ product: "Hamper", awb: "AB<script>" }), ShipError);
  assert.throws(() => cleanShipment({ product: "Hamper", status: "shipped" }), ShipError, "shipped needs courier + AWB");
  assert.deepEqual(cleanShipment({ product: "  Diwali   hamper ", carrier: "Delhivery", awb: "1234 5678 90", status: "shipped" }),
    { product: "Diwali hamper", carrier: "Delhivery", awb: "1234567890", status: "shipped", note: null });
  assert.equal(cleanShipment({ product: "Kurta", status: "delivered" }).status, "pending", "can't start as delivered");
});

test("address lines skip empty parts", () => {
  assert.deepEqual(addressLines({ name: "Asha", line1: "12 MG Road", line2: "", city: "Pune", state: "MH", pincode: "411001", phone: null }), ["Asha", "12 MG Road", "Pune, MH 411001"]);
  assert.deepEqual(addressLines(null), []);
});
