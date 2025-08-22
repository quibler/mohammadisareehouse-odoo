/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";
import { useExternalListener } from "@odoo/owl";

/**
 * Minimal Order Summary Enhancement
 * Only handles Delete key for selected orderlines
 */

patch(OrderSummary.prototype, {
    setup() {
        super.setup();
        useExternalListener(window, "keydown", this._onDelete.bind(this));
    },

    _onDelete(event) {
        // Only Delete key on Product Screen
        if (event.key !== "Delete" && event.key !== "Del") return;

        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' ||
            event.target.closest('.modal, .popup, .dialog, .dropdown-menu, .o_popover') ||
            !document.querySelector('.product-screen:not(.oe_hidden)')?.offsetParent) {
            return;
        }

        const selectedLine = this.currentOrder?.get_selected_orderline();
        if (selectedLine) {
            event.preventDefault();
            event.stopPropagation();
            this.currentOrder.removeOrderline(selectedLine);
        }
    },

    // Method to delete a specific line (called from X button clicks)
    deleteOrderLine(line) {
        const order = this.currentOrder;
        if (!order || !line) {
            return;
        }

        order.removeOrderline(line);
    }
});