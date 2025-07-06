from odoo import models, fields, api


class ProductLabelLayout(models.TransientModel):
    _inherit = 'product.label.layout'

    def _get_print_format_selection(self):
        """Return only our custom selection options"""
        return [
            ('dymo', 'Dymo'),
            ('dymo_without_price', 'Dymo without price'),
        ]

    # Completely redefine the field with _rec_name trick to force override
    print_format = fields.Selection(
        selection='_get_print_format_selection',
        string="Format",
        default='dymo',
        required=True
    )

    def _prepare_report_data(self):
        """Override to handle both dymo formats correctly"""
        if self.print_format == 'dymo_without_price':
            # Use our custom report action
            xml_id = 'pos_sales_person.action_report_dymo_without_price'
            data = {}
        elif self.print_format == 'dymo':
            # For standard Dymo, call the parent method to get proper data
            xml_id, data = super()._prepare_report_data()
        else:
            # Fallback
            xml_id, data = super()._prepare_report_data()

        return xml_id, data