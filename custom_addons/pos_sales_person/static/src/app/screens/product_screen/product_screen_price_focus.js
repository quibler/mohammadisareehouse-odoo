/** @odoo-module */

import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";
import { patch } from "@web/core/utils/patch";

/**
 * Simple Price Focus Enhancement for POS Sales Person Module
 * Makes the Price button the default focus when selecting items in POS
 */

patch(ProductScreen.prototype, {

    setup() {
        super.setup();
        // Always set default numpad mode to price when screen loads
        // (if user has price control rights)
        if (this.pos.cashierHasPriceControlRights()) {
            this.pos.numpadMode = "price";
        }
    },

    async addProductToOrder(product) {
        // Call parent method first (includes sales person logic)
        await super.addProductToOrder(product);

        // Set numpad mode to price after adding product
        if (this.pos.cashierHasPriceControlRights()) {
            this.pos.numpadMode = "price";
        }
    },

    onNumpadClick(buttonValue) {
        if (["quantity", "discount", "price"].includes(buttonValue)) {
            this.numberBuffer.capture();
            this.numberBuffer.reset();
            this.pos.numpadMode = buttonValue;
            return;
        }

        // If it's a number input and currently in quantity mode,
        // but user has price rights, switch to price mode
        if (!isNaN(buttonValue) &&
            this.pos.numpadMode === "quantity" &&
            this.pos.cashierHasPriceControlRights()) {
            this.pos.numpadMode = "price";
        }

        this.numberBuffer.sendKey(buttonValue);
    }
});

patch(OrderSummary.prototype, {

    _setValue(val) {
        const { numpadMode } = this.pos;
        let selectedLine = this.currentOrder.get_selected_orderline();

        if (selectedLine) {
            if (numpadMode === "quantity") {
                if (selectedLine.combo_parent_id) {
                    selectedLine = selectedLine.combo_parent_id;
                }
                if (val === "remove") {
                    this.currentOrder.removeOrderline(selectedLine);
                    // After removing, set mode back to price if user has rights
                    if (this.pos.cashierHasPriceControlRights()) {
                        this.pos.numpadMode = "price";
                    }
                } else {
                    const result = selectedLine.set_quantity(
                        val,
                        Boolean(selectedLine.combo_line_ids?.length)
                    );
                    for (const line of selectedLine.combo_line_ids) {
                        line.set_quantity(val, true);
                    }
                    if (result !== true) {
                        this.dialog.add(AlertDialog, result);
                        this.numberBuffer.reset();
                    }
                }
            } else if (numpadMode === "discount" && val !== "remove") {
                this.pos.setDiscountFromUI(selectedLine, val);
            } else if (numpadMode === "price" && val !== "remove") {
                this.setLinePrice(selectedLine, val);
            }
        }
    }
});