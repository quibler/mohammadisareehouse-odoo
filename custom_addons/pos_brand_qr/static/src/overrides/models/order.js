/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    export_for_printing() {
        const receipt = super.export_for_printing(...arguments);

        console.log('=== POS Brand QR Debug ===');

        // Try different ways to access the POS instance
        let posInstance = this.pos || this.env?.services?.pos || this.session;

        console.log('this.pos exists:', !!this.pos);
        console.log('this.env exists:', !!this.env);
        console.log('this.session exists:', !!this.session);
        console.log('posInstance found:', !!posInstance);

        if (posInstance && posInstance.config) {
            console.log('Found config through posInstance');
            console.log('brand_qr_enabled:', posInstance.config.brand_qr_enabled);
            console.log('brand_qr_image exists:', !!posInstance.config.brand_qr_image);
            console.log('brand_qr_label:', posInstance.config.brand_qr_label);
        } else if (this.config) {
            console.log('Found config directly on this');
            posInstance = { config: this.config };
            console.log('brand_qr_enabled:', this.config.brand_qr_enabled);
            console.log('brand_qr_image exists:', !!this.config.brand_qr_image);
        } else {
            console.log('No config found anywhere');
            console.log('Available properties on this:', Object.keys(this));
        }

        // Add brand QR code data if enabled and image is uploaded
        try {
            if (posInstance && posInstance.config && posInstance.config.brand_qr_enabled && posInstance.config.brand_qr_image) {
                console.log('Adding QR code to receipt');
                receipt.brand_qr_code = {
                    enabled: true,
                    image: posInstance.config.brand_qr_image,
                    label: posInstance.config.brand_qr_label || 'Visit our website',
                };
            } else {
                console.log('QR code not added - conditions not met');
                receipt.brand_qr_code = {
                    enabled: false
                };
            }
        } catch (error) {
            console.error('Error adding brand QR code to receipt:', error);
            receipt.brand_qr_code = {
                enabled: false
            };
        }

        console.log('Final receipt.brand_qr_code:', receipt.brand_qr_code);
        console.log('=== End Debug ===');

        return receipt;
    },
});