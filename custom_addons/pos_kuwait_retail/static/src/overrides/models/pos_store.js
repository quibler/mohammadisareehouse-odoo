/** @odoo-module **/

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    orderExportForPrinting(order) {
        const result = super.orderExportForPrinting(order);
        // Add POS config name to the receipt data
        result.pos_config_name = this.config.name;
        return result;
    }
});