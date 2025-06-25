/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { SelectionPopup } from "@point_of_sale/app/utils/input_popups/selection_popup";
import { makeAwaitable, ask } from "@point_of_sale/app/store/make_awaitable_dialog";

export class SalesPersonButton extends Component {
    static template = "pos_sales_person.SalesPersonButton";
    static props = {};

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
    }

    _prepareEmployeeList(currentSalesPerson) {
        // Get all employees using the getAll() method
        const allEmployees = this.pos.models["hr.employee"].getAll();

        // Get the allowed employee IDs
        let allowedEmployeeIds = [];
        if (this.pos.config.sales_person_ids && Array.isArray(this.pos.config.sales_person_ids)) {
            // Extract IDs from the Proxy objects
            allowedEmployeeIds = Array.from(this.pos.config.sales_person_ids).map(emp => emp.id);
        }

        // Filter employees that are in the allowed list
        let employeesToShow = allEmployees;
        if (allowedEmployeeIds.length > 0) {
            employeesToShow = allEmployees.filter(
                (employee) => allowedEmployeeIds.includes(employee.id)
            );
        }

        const res = employeesToShow.map((employee) => {
            return {
                id: employee.id,
                item: employee,
                label: employee.name,
                isSelected: employee.id === currentSalesPerson,
            };
        });

        if (currentSalesPerson) {
            res.push({
                id: -1,
                item: {},
                label: "Clear",
                isSelected: false,
            });
        }

        return res;
    }

    async onClick() {
        const order = this.pos.get_order();

        if (!order) {
            return;
        }

        const employeesList = this._prepareEmployeeList(order.getSalesPerson()?.id);

        if (!employeesList.length) {
            await ask(this.dialog, {
                title: _t("No Sales Person"),
                body: _t("There are no sales persons available for this POS. Please configure allowed sales persons in the POS settings."),
            });
            return;
        }

        let sales_person = await makeAwaitable(this.dialog, SelectionPopup, {
            title: _t("Select Sales Person"),
            list: employeesList,
        });

        if (!sales_person) {
            return;
        }

        if (sales_person.id === -1){
            order.setSalesPerson(false);
        } else {
            order.setSalesPerson(sales_person);
        }
    }
}