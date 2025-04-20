from odoo.osv.expression import OR
from odoo import models, fields, api

class PosConfig(models.Model):
    _inherit = 'pos.config'

    sales_person_ids = fields.Many2many(
        'hr.employee',
        'config_allowed_salesperson_rel',
        'employee_id',
        'pos_config_id',
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

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_sales_person_ids = fields.Many2many(related='pos_config_id.sales_person_ids', readonly=False)