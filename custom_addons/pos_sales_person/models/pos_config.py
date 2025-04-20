from odoo.osv.expression import OR
from odoo import models, fields, api

class PosConfig(models.Model):
    _inherit = 'pos.config'

    sales_person_ids = fields.Many2many(
        'hr.employee',
        'config_allowed_salesperson_rel',
        'pos_config_id',  # This is the column in the relation table for this model
        'employee_id',  # This is the column in the relation table for the related model
        string="Allowed sales persons",
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
                domain = [('id', 'in', [])]  # No allowed sales persons
        else:
            domain = [('id', 'in', self.sales_person_ids.ids)]
        return domain

    def _get_pos_ui_pos_config(self, params):
        """Add sales_person_ids to the POS config data sent to the frontend"""
        config_data = super()._get_pos_ui_pos_config(params)
        config_data['sales_person_ids'] = self.sales_person_ids.ids
        return config_data

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_sales_person_ids = fields.Many2many(related='pos_config_id.sales_person_ids', readonly=False)