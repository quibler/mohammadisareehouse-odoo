/** @odoo-module */

import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { patch } from "@web/core/utils/patch";

/**
 * Simple Price Focus Override
 * Minimal approach to change default focus from qty to price
 */

patch(ProductScreen.prototype, {

    async addProductToOrder(product) {
        // Call parent method first
        await super.addProductToOrder(product);

        // Set price focus after adding product (simple check)
        if (this.pos?.cashierHasPriceControlRights?.()) {
            this.pos.numpadMode = "price";
        }
    },

    selectOrderline(orderline) {
        // Call parent method first
        super.selectOrderline(orderline);

        // Set price focus when selecting order line (simple check)
        if (this.pos?.cashierHasPriceControlRights?.()) {
            this.pos.numpadMode = "price";
        }
    }
});