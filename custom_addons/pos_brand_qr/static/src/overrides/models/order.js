/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    export_for_printing() {
        const receipt = super.export_for_printing(...arguments);

        // Add brand QR code data if enabled and image is uploaded
        if (this.pos.config.brand_qr_enabled && this.pos.config.brand_qr_image) {
            receipt.brand_qr_code = {
                enabled: true,
                image: this.pos.config.brand_qr_image,
                label: this.pos.config.brand_qr_label || 'Visit our website',
            };
        } else {
            receipt.brand_qr_code = {
                enabled: false
            };
        }

        return receipt;
    },
});