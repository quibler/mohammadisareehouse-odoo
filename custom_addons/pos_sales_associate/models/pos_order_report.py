from odoo import models, fields, api


class PosOrderReport(models.Model):
    _inherit = 'report.pos.order'

    employee_id = fields.Many2one('hr.employee', string='Sales Associate', readonly=True)

    def _select(self):
        select_str = super()._select()
        # The SELECT clause likely uses 's' as the table alias for pos_order
        # Let's match their convention
        return select_str + ", s.employee_id as employee_id"

    def _group_by(self):
        group_by_str = super()._group_by()
        # GROUP BY also needs to use the same table alias
        return group_by_str + ", s.employee_id"