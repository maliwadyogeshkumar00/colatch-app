// Unit tests never touch a database. Anything that tries gets a clear error instead of a hang.
class Pool { constructor() {} connect() { throw new Error("Unit tests must not use the database"); } query() { throw new Error("Unit tests must not use the database"); } on() {} end() {} }
export default { Pool };
