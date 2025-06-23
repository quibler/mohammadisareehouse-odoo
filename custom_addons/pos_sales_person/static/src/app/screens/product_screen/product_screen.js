/** @odoo-module */

import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { patch } from "@web/core/utils/patch";

/**
 * Minimal Price Focus Enhancement
 * Sets Price as default focus with minimal code
 */

patch(ProductScreen.prototype, {

    setup() {
        super.setup();
        // Set default numpad mode to price when screen loads
        if (this.pos.cashierHasPriceControlRights()) {
            this.pos.numpadMode = "price";
        }
    },

    async addProductToOrder(product) {
        // Call parent method first
        await super.addProductToOrder(product);
        // Set to price mode after adding product
        if (this.pos.cashierHasPriceControlRights()) {
            this.pos.numpadMode = "price";
        }
    },

    selectOrderline(orderline) {
        super.selectOrderline(orderline);
        // Set to price mode when selecting lines
        if (this.pos.cashierHasPriceControlRights()) {
            this.pos.numpadMode = "price";
        }
    }
});