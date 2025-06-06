/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    export_for_printing() {
        const receipt = super.export_for_printing(...arguments);

        // Get POS config - try different ways to access it
        let config = null;
        if (this.pos && this.pos.config) {
            config = this.pos.config;
        } else if (this.config) {
            config = this.config;
        }

        // Add brand QR code data if enabled and available
        if (config && config.brand_qr_enabled && config.brand_qr_image) {
            receipt.brand_qr_code = {
                enabled: true,
                image: config.brand_qr_image,
                label: config.brand_qr_label || 'Visit our website',
            };
        } else {
            receipt.brand_qr_code = {
                enabled: false
            };
        }

        return receipt;
    },
});