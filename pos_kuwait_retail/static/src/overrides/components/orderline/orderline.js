/** @odoo-module */

import { Orderline } from "@point_of_sale/app/generic_components/orderline/orderline";
import { patch } from "@web/core/utils/patch";

/**
 * Minimal Orderline Enhancement
 * Keyboard handling is now done centrally in pos_store.js to avoid duplicate listeners
 */

patch(Orderline.prototype, {
    // No additional keyboard handling needed here - handled centrally in pos_store.js
});