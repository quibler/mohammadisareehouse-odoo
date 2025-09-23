from odoo import models
from collections import defaultdict


class ReportProductTemplateLabelDymo(models.AbstractModel):
    _inherit = 'report.product.report_producttemplatelabel_dymo'

    def _get_report_values(self, docids, data):
        """Override for label report values"""
        # Get the original report values
        result = super()._get_report_values(docids, data)

        return result