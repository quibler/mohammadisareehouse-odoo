from odoo import models, fields, api


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _loader_params_pos_order(self):
        result = super()._loader_params_pos_order()
        if 'employee_id' not in result['search_params']['fields']:
            result['search_params']['fields'].append('employee_id')
        return result

    def _pos_ui_models_to_load(self):
        models_to_load = super()._pos_ui_models_to_load()
        if 'hr.employee' not in models_to_load:
            models_to_load.append('hr.employee')
        return models_to_load

    def _loader_params_hr_employee(self):
        return {
            'search_params': {
                'domain': [('company_id', '=', self.config_id.company_id.id)],
                'fields': ['name', 'id'],
            },
        }