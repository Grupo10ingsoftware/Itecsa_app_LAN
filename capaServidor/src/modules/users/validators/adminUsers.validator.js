import { USER_DEPARTMENTS } from '../../../../../shared/userDepartments.js';
import { FUNCTIONAL_ROLES } from '../../../config/roles.js';
import { USER_STATUS_FILTERS } from '../../../config/userLifecycle.js';
const LIST_USER_STATUSES = new Set(USER_STATUS_FILTERS);

function invalidRequest(message) {
    return { valid: false, message };
}

function parseIntegerQuery(value, fallback, { min, max }) {
    const parsedValue = Number.parseInt(value, 10);

    if (!Number.isInteger(parsedValue)) {
        return fallback;
    }

    return Math.min(Math.max(parsedValue, min), max);
}

export function validateListUsersQuery(query = {}) {
    const page = parseIntegerQuery(query.page, 1, { min: 1, max: 500 });
    const perPage = parseIntegerQuery(query.perPage, 10, { min: 1, max: 50 });
    const search = typeof query.search === "string" ? query.search.trim() : "";
    const estadoUsuario =
        typeof query.estadoUsuario === "string"
            ? query.estadoUsuario.trim()
            : "";
    const rolUsuario =
        typeof query.rolUsuario === "string" ? query.rolUsuario.trim() : "";

    if (query.department !== undefined && (typeof query.department !== 'string' ||
        (query.department !== '' && !USER_DEPARTMENTS.some(item => item.value === query.department)))) {
        return invalidRequest("El departamento no es valido.");
    }

    if (estadoUsuario && !LIST_USER_STATUSES.has(estadoUsuario)) {
        return invalidRequest("El estadoUsuario no es valido.");
    }

    if (rolUsuario && !FUNCTIONAL_ROLES.includes(rolUsuario)) {
        return invalidRequest("El rolUsuario no es valido.");
    }

    return {
        valid: true,
        filters: {
            page,
            perPage,
            search,
            estadoUsuario,
            rolUsuario,
            ...(query.department ? { department: query.department } : {}),
        },
    };
}

export function validateUserMovementsQuery(query = {}) {
    const page = Number(query.page ?? 1);
    const perPage = Number(query.perPage ?? 10);
    if (
        !Number.isSafeInteger(page) || page < 1 ||
        !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 50 ||
        !Number.isSafeInteger(page * perPage) ||
        (query.page !== undefined && typeof query.page !== "string") ||
        (query.perPage !== undefined && typeof query.perPage !== "string")
    ) return invalidRequest("La paginación de movimientos no es válida.");
    if (query.search !== undefined && (typeof query.search !== 'string' || query.search.trim().length > 120)) {
        return invalidRequest("La búsqueda de movimientos no es válida.");
    }
    const search = query.search?.trim();
    return { valid: true, filters: { page, perPage, ...(search ? { search } : {}) } };
}
