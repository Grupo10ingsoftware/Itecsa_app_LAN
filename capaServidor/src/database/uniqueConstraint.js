// Match only the named application constraint, across Prisma/driver-adapter formats.
export function isUniqueConstraint(error, { model, index, field }) {
  if (error?.code !== 'P2002' || (error.meta?.modelName && error.meta.modelName !== model)) return false;
  const target = error.meta?.target;
  const constraint = error.meta?.driverAdapterError?.cause?.constraint;
  const singleField = value => Array.isArray(value) && value.length === 1 && value[0] === field;
  return target === index || target === field || singleField(target) ||
    constraint?.index === index || singleField(constraint?.fields);
}
