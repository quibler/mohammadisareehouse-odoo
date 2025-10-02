import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    setSalesPerson(sales_person) {
        this.update({ sales_person_id: sales_person });
    },

    getSalesPerson() {
        return this.sales_person_id;
    },

    export_for_printing() {
        const order = super.export_for_printing(...arguments);
        // Add sales person info
        order.sales_person = this.sales_person_id ? this.sales_person_id.name : false;

        // Add POS config name for receipt printing
        order.pos_config_name = this.config_id ? this.config_id.name : false;

        // Add invoice reference (order.name) for matching with invoice
        order.invoice_reference = this.name;

        return order;
    },
});