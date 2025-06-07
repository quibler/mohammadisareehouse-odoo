/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    export_for_printing() {
        const receipt = super.export_for_printing(...arguments);

        // Debug: Try different ways to access config
        console.log("=== POS Brand QR Debug V2 ===");
        console.log("this.pos:", this.pos);
        console.log("this.pos.config:", this.pos?.config);
        console.log("this.config:", this.config);
        console.log("this.pos_session:", this.pos_session);
        console.log("this.pos.models:", this.pos?.models);

        // Try multiple ways to get config
        let config = null;

        // Method 1: Direct access
        if (this.pos && this.pos.config) {
            config = this.pos.config;
            console.log("Method 1 - Direct access works:", config);
        }

        // Method 2: Through session
        else if (this.pos_session && this.pos_session.config_id) {
            config = this.pos_session.config_id;
            console.log("Method 2 - Session access works:", config);
        }

        // Method 3: Through models (Odoo 18 style)
        else if (this.pos && this.pos.models && this.pos.models['pos.config']) {
            const configs = this.pos.models['pos.config'].getAll();
            config = configs.length > 0 ? configs[0] : null;
            console.log("Method 3 - Models access works:", config);
        }

        // Method 4: Check if config is stored differently
        else if (this.pos && this.pos.session && this.pos.session.config_id) {
            config = this.pos.session.config_id;
            console.log("Method 4 - Session config_id works:", config);
        }

        console.log("Final config object:", config);

        if (config) {
            console.log("Brand QR enabled:", config.brand_qr_enabled);
            console.log("Brand QR image:", config.brand_qr_image);
            console.log("Brand QR label:", config.brand_qr_label);
        }

        // Add brand QR code data - always add the object for debugging
        receipt.brand_qr_code = {
            enabled: !!(config?.brand_qr_enabled && config?.brand_qr_image),
            image: config?.brand_qr_image || null,
            label: config?.brand_qr_label || 'Visit our website',
            // Debug fields
            debug_config_exists: !!config,
            debug_enabled_setting: config?.brand_qr_enabled,
            debug_image_exists: !!config?.brand_qr_image,
            debug_config_method: config ? 'found' : 'not_found'
        };

        console.log("Receipt brand_qr_code object:", receipt.brand_qr_code);
        console.log("=== End Debug V2 ===");

        return receipt;
    },
});