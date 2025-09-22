/** @odoo-module */

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    /**
     * Override export_for_printing to use Arabic category prefixed product names
     */
    export_for_printing(baseUrl, headerData) {
        const result = super.export_for_printing(baseUrl, headerData);

        // Modify orderlines to use Arabic category prefixed product names for receipt
        result.orderlines = result.orderlines.map(lineData => {
            // Find the corresponding order line object
            const orderLine = this.lines.find(line =>
                line.getDisplayData().productName === lineData.productName
            );

            if (orderLine && orderLine.getReceiptProductName) {
                // Use the Arabic category prefixed product name for receipt (synchronous)
                const prefixedName = orderLine.getReceiptProductName();
                if (prefixedName !== lineData.productName) {
                    lineData.productName = prefixedName;
                }
            }

            return lineData;
        });

        return result;
    }
});