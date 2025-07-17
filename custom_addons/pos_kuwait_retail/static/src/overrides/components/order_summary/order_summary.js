/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";
import { useExternalListener } from "@odoo/owl";

patch(OrderSummary.prototype, {
    setup() {
        super.setup();
        
        // Add keyboard event listener for Delete key
        useExternalListener(window, "keydown", this._onKeyDown.bind(this));
    },

    _onKeyDown(event) {
        // Check if Delete key is pressed
        if (event.key === "Delete" || event.key === "Del") {
            // Only process if not in an input field or textarea
            if (!["INPUT", "TEXTAREA"].includes(event.target.tagName)) {
                event.preventDefault();
                event.stopPropagation();
                this._handleDeleteKey();
            }
        }
    },

    _handleDeleteKey() {
        const order = this.currentOrder;
        const selectedLine = order?.get_selected_orderline();

        if (!order || !selectedLine || order.is_empty()) {
            return;
        }

        // Directly delete the line without confirmation
        this._deleteSelectedLine();
    },

    _deleteSelectedLine() {
        const order = this.currentOrder;
        const selectedLine = order?.get_selected_orderline();

        if (!order || !selectedLine) {
            return;
        }

        // Remove the orderline using the pos.order's removeOrderline method
        order.removeOrderline(selectedLine);
    },

    // Method to delete a specific line (called from X button)
    deleteOrderLine(line) {
        const order = this.currentOrder;
        if (!order || !line) {
            return;
        }
        
        // Remove the orderline using the pos.order's removeOrderline method
        order.removeOrderline(line);
    },
});