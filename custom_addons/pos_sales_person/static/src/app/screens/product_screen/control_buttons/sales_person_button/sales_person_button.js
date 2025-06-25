/** @odoo-module **/

import { Component } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

export class SalesPersonButton extends Component {
    static template = "custom_pos.SalesPersonButton";

    setup() {
        this.pos = useService("pos");
        this.popup = useService("popup");
        this.notification = useService("pos_notification");
    }

    get currentOrder() {
        return this.pos.get_order();
    }

    get salesPersonName() {
        const order = this.currentOrder;
        if (order && order.sales_person_id) {
            const employee = this.pos.employees.find(emp => emp.id === order.sales_person_id);
            return employee ? employee.name : _t("Unknown");
        }
        return _t("Select Sales Person");
    }

    get allowedEmployees() {
        const allowedIds = this.pos.config.sales_person_ids || [];
        if (allowedIds.length === 0) {
            return this.pos.employees; // If no restriction, show all employees
        }
        return this.pos.employees.filter(emp => allowedIds.includes(emp.id));
    }

    async onClick() {
        const order = this.currentOrder;
        if (!order) {
            return;
        }

        const allowedEmployees = this.allowedEmployees;

        if (allowedEmployees.length === 0) {
            this.notification.add(
                _t("No sales persons configured for this POS"),
                { type: "warning" }
            );
            return;
        }

        const selectionList = allowedEmployees.map(emp => ({
            id: emp.id,
            label: emp.name,
            isSelected: order.sales_person_id === emp.id,
            item: emp
        }));

        // Add option to clear selection
        selectionList.unshift({
            id: null,
            label: _t("No Sales Person"),
            isSelected: !order.sales_person_id,
            item: null
        });

        const { confirmed, payload } = await this.popup.add("SelectionPopup", {
            title: _t("Select Sales Person"),
            list: selectionList,
        });

        if (confirmed) {
            const selectedEmployee = payload;
            order.set_sales_person(selectedEmployee ? selectedEmployee.id : null);

            if (selectedEmployee) {
                this.notification.add(
                    _t("Sales person set to %s", selectedEmployee.name),
                    { type: "success" }
                );
            } else {
                this.notification.add(
                    _t("Sales person cleared"),
                    { type: "info" }
                );
            }
        }
    }
}