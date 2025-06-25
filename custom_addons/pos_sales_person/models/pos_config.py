from odoo.osv.expression import OR
from odoo import models, fields, api


class PosConfig(models.Model):
    _inherit = 'pos.config'

    # Sales Person Configuration
    sales_person_ids = fields.Many2many(
        'hr.employee',
        'config_allowed_salesperson_rel',
        'pos_config_id',
        'employee_id',
        string="Allowed Sales Persons",
        help="Configure which employees can be selected as sales persons in this POS"
    )

    # Global Discount Configuration
    global_discount_type = fields.Selection([
        ('percentage', 'Percentage'),
        ('amount', 'Fixed Amount'),
        ('both', 'Both Percentage and Amount')
    ], string='Global Discount Type', default='both',
        help="Choose the type of global discount available in POS")

    max_global_discount_amount = fields.Float(
        string='Maximum Global Discount Amount',
        default=100.0,
        help="Maximum discount amount allowed for amount-based discounts"
    )

    enable_amount_discount = fields.Boolean(
        string='Enable Amount-based Discount',
        default=True,
        help="Allow cashiers to apply fixed amount discounts globally"
    )

    def _employee_domain(self, user_id):
        if self.module_pos_hr:
            domain = super()._employee_domain(user_id)
            if len(self.sales_person_ids) > 0:
                domain = OR([
                    domain,
                    [('id', 'in', self.sales_person_ids.ids)]
                ])
            else:
                domain = [('id', 'in', [])]
        else:
            domain = [('id', 'in', self.sales_person_ids.ids)]
        return domain

    def _get_pos_ui_pos_config(self, params):
        """Add custom configuration to POS frontend"""
        config_data = super()._get_pos_ui_pos_config(params)
        config_data.update({
            'sales_person_ids': self.sales_person_ids.ids,
            'global_discount_type': self.global_discount_type,
            'max_global_discount_amount': self.max_global_discount_amount,
            'enable_amount_discount': self.enable_amount_discount,
        })
        return config_data


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # Sales Person Settings
    pos_sales_person_ids = fields.Many2many(
        related='pos_config_id.sales_person_ids',
        readonly=False
    )

    # Global Discount Settings
    pos_global_discount_type = fields.Selection(
        related='pos_config_id.global_discount_type',
        readonly=False
    )

    pos_max_global_discount_amount = fields.Float(
        related='pos_config_id.max_global_discount_amount',
        readonly=False
    )

    pos_enable_amount_discount = fields.Boolean(
        related='pos_config_id.enable_amount_discount',
        readonly=False
    )