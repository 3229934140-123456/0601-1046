function checkQualification(merchant, rules) {
  const issues = [];
  const qRules = rules.qualification || {};
  const requiredTypes = qRules.required_types || [];
  const minCredit = qRules.min_credit_score || 0;
  const requireRealName = qRules.require_real_name || false;

  const missingDocs = requiredTypes.filter(
    (doc) => !(merchant.qualifications || []).includes(doc)
  );
  if (missingDocs.length > 0) {
    issues.push({
      code: "Q001",
      level: "error",
      message: `缺少必要资质: ${missingDocs.join("、")}`,
      detail: { required: requiredTypes, actual: merchant.qualifications, missing: missingDocs },
    });
  }

  if ((merchant.credit_score || 0) < minCredit) {
    issues.push({
      code: "Q002",
      level: "error",
      message: `信用分不达标: ${merchant.credit_score} < ${minCredit}`,
      detail: { actual: merchant.credit_score, required: minCredit },
    });
  }

  if (requireRealName && !merchant.real_name_verified) {
    issues.push({
      code: "Q003",
      level: "error",
      message: "未完成实名认证",
      detail: { real_name_verified: false },
    });
  }

  return {
    shop_id: merchant.shop_id,
    shop_name: merchant.shop_name,
    check: "qualification",
    passed: issues.length === 0,
    issues,
  };
}

module.exports = { checkQualification };
