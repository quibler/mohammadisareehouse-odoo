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
         console.log("SalesPersonButton setup called");
    }

    _prepareEmployeeList(currentSalesPerson) {
        const allEmployees = this.pos.models["hr.employee"].filter(
            (employee) => employee.id !== currentSalesPerson
        );

        const res = allEmployees.map((employee) => {
            return {
                id: employee.id,
                item: employee,
                label: employee.name,
                isSelected: false,
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
        console.log("SalesPersonButton onClick called");
        const order = this.pos.get_order();

        if (!order) {
            console.log("No current order");
            return;
        }

        if (order.lines.length <= 0) {
            console.log("Order has no lines");
            return;
        }

        const employeesList = this._prepareEmployeeList(order.getSalesPerson()?.id);
        console.log("Employee list:", employeesList);

        if (!employeesList.length) {
            await ask(this.dialog, {
                title: _t("No Sales Person"),
                body: _t("There is no sales person available."),
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