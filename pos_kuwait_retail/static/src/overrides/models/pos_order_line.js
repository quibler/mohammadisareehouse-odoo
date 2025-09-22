/** @odoo-module */

import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { patch } from "@web/core/utils/patch";

patch(PosOrderline.prototype, {
    /**
     * Override getDisplayData - no changes needed here for basic display
     */
    getDisplayData() {
        return super.getDisplayData();
    },

    /**
     * Get product name with Arabic category prefix for receipt only
     */
    getReceiptProductName() {
        const displayData = this.getDisplayData();
        const arabicCategoryName = this._getArabicCategoryName();

        if (arabicCategoryName) {
            return `${arabicCategoryName} - ${displayData.productName}`;
        }
        return displayData.productName;
    },

    /**
     * Get Arabic category name (should now be loaded as the default name from backend)
     */
    _getArabicCategoryName() {
        const product = this.product_id;

        if (!product || !product.pos_categ_ids || product.pos_categ_ids.length === 0) {
            return false;
        }

        const firstCategory = product.pos_categ_ids[0];
        if (!firstCategory) {
            return false;
        }

        // The name should now be in Arabic from the backend
        return firstCategory.name;
    },

});