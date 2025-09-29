/** @odoo-module */

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    /**
     * Override export_for_printing to add Arabic category info and clean product names for receipt
     */
    export_for_printing(baseUrl, headerData) {
        const result = super.export_for_printing(baseUrl, headerData);

        // Add category info to orderlines for receipt template
        result.orderlines = result.orderlines.map(lineData => {
            const orderLine = this.lines.find(line =>
                line.getDisplayData().productName === lineData.productName
            );

            if (orderLine && orderLine.product_id) {
                const product = orderLine.product_id;
                if (product.pos_categ_ids && product.pos_categ_ids.length > 0) {
                    const category = product.pos_categ_ids[0];
                    lineData.categoryNameAr = category.name_ar;
                    lineData.isDiscountProduct = lineData.productName.toLowerCase().includes('discount');

                    // Simple debug for that specific product
                    if (lineData.productName.includes('102') && lineData.productName.includes('LD')) {
                        console.log('Product name from lineData:', lineData.productName);
                        console.log('Product name from product record:', product.name);
                    }
                }
            }

            return lineData;
        });

        // Add customer information if available
        const partner = this.get_partner();
        if (partner) {
            result.customer = {
                name: partner.name || "",
                street: partner.street || "",
                street2: partner.street2 || "",
                city: partner.city || "",
                zip: partner.zip || "",
                state_id: partner.state_id ? partner.state_id.name : "",
                country_id: partner.country_id ? partner.country_id.name : "",
                phone: partner.phone || "",
                email: partner.email || ""
            };
        }

        return result;
    }
});