/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { patch } from "@web/core/utils/patch";

/**
 * Override POS Store to change default numpad mode
 * This intercepts the core behavior at the store level
 */

patch(PosStore.prototype, {

    /**
     * Override the numpadMode setter to default to price
     */
    set numpadMode(mode) {
        // Safety check: only override if POS is ready and user has price rights
        if (mode === "quantity" && this.config && this.user && this.cashierHasPriceControlRights()) {
            this._numpadMode = "price";
        } else {
            this._numpadMode = mode;
        }
    },

    /**
     * Override the numpadMode getter
     */
    get numpadMode() {
        // Safety check: only default to price if POS is ready and user has price rights
        if (!this._numpadMode && this.config && this.user && this.cashierHasPriceControlRights()) {
            this._numpadMode = "price";
        }
        return this._numpadMode || "quantity";
    },

    /**
     * Override get_order to ensure price mode on order selection
     */
    get_order() {
        const order = super.get_order();
        // When getting an order, set price mode as default (with safety checks)
        if (order && this.config && this.user && this.cashierHasPriceControlRights()) {
            setTimeout(() => {
                this.numpadMode = "price";
            }, 0);
        }
        return order;
    }
});