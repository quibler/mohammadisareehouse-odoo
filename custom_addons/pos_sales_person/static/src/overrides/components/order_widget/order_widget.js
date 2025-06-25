/** @odoo-module */

import { OrderWidget } from "@point_of_sale/app/generic_components/order_widget/order_widget";
import { patch } from "@web/core/utils/patch";

patch(OrderWidget, {
    props: {
        ...OrderWidget.props,
        sales_person: { type: String, optional: true },
        global_discount_amount: { type: Number, optional: true },
        global_discount_type: { type: String, optional: true },
    }
});

patch(OrderWidget.prototype, {
    setup() {
        super.setup();
    },

    get orderSummary() {
        const summary = super.orderSummary;
        const order = this.pos.get_order();

        if (order && order.global_discount_amount > 0) {
            summary.globalDiscountAmount = order.global_discount_amount;
            summary.formattedGlobalDiscountAmount = this.pos.format_currency(order.global_discount_amount);
        }

        return summary;
    },

    get salesPersonName() {
        const order = this.pos.get_order();
        if (order && order.sales_person_id) {
            const employee = this.pos.employees.find(emp => emp.id === order.sales_person_id);
            return employee ? employee.name : '';
        }
        return '';
    }
});