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
        order.sales_person = this.sales_person_id ? this.sales_person_id.name : false;
        return order;
    },
});