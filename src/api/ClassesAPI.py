from . import JavascriptObject


class MineflayerClassAPIBase:
    def __init__(self, o: JavascriptObject):
        self._raw = o

    def as_raw(self) -> JavascriptObject:
        return self._raw


class Vector3(MineflayerClassAPIBase):
    """Vector3 represents a location or direction.

    See: https://github.com/PrismarineJS/node-vec3
    """

    def __init__(self, o: JavascriptObject):
        super().__init__(o)

    @property
    def x(self):
        """South direction."""
        return float(getattr(self._raw, "x"))

    @x.setter
    def x(self, v: float):
        setattr(self._raw, "x", v)

    @property
    def y(self):
        return float(getattr(self._raw, "y"))

    @y.setter
    def y(self, v: float):
        """Up direction."""
        setattr(self._raw, "y", v)

    @property
    def z(self):
        return float(getattr(self._raw, "z"))

    @z.setter
    def z(self, v: float):
        """West direction."""
        setattr(self._raw, "z", v)

    def __str__(self):
        return f"({round(self.x, 1)}, {round(self.y, 1)}, {round(self.z, 1)})"

    def __repr__(self):
        return "{" + f"x={round(self.x, 1)}, y={round(self.y, 1)}, z={round(self.y, 1)}" + "}"


class Entity(MineflayerClassAPIBase):
    """Entities represent players, mobs, and objects.

    See: https://github.com/PrismarineJS/prismarine-entity
    """

    def __init__(self, o: JavascriptObject):
        super().__init__(o)

    @property
    def id(self):
        """Entity ID."""
        return getattr(self._raw, "id")

    @property
    def type(self):
        """Enums of player, mob, object, global, orb, other."""
        return getattr(self._raw, "type")

    @property
    def username(self):
        """[player] Player's name."""
        return getattr(self._raw, "username", None)

    @property
    def mobType(self):
        """[mob] Mob's type."""
        return getattr(self._raw, "mobType", None)

    @property
    def displayName(self):
        """[mob, object] Long name."""
        return getattr(self._raw, "displayName", None)

    @property
    def entityType(self):
        """[mob, object] Numerical type."""
        return getattr(self._raw, "entityType", None)

    @property
    def kind(self):
        """[mob, object] Kind of entity (Hostile, Passive, NPC, ...)."""
        return getattr(self._raw, "kind", None)

    @property
    def name(self):
        """[mob, object] Short name."""
        return getattr(self._raw, "name", None)

    @property
    def objectType(self):
        """[object] Object's type."""
        return getattr(self._raw, "objectType", None)

    @property
    def count(self):
        """[orb] Experience amount."""
        return getattr(self._raw, "count", None)

    @property
    def position(self):
        return getattr(self._raw, "position")

    @property
    def velocity(self):
        return getattr(self._raw, "velocity")

    @property
    def yaw(self):
        return getattr(self._raw, "yaw")

    @property
    def pitch(self):
        return getattr(self._raw, "pitch")

    @property
    def height(self):
        return getattr(self._raw, "height")

    @property
    def width(self):
        return getattr(self._raw, "width")

    @property
    def onGround(self):
        return getattr(self._raw, "onGround")

    @property
    def equipment(self):
        """Version dependent."""
        return getattr(self._raw, "equipment", [None] * 6)

    @property
    def heldItem(self):
        """Equivalent to equipment[0]."""
        return getattr(self._raw, "heldItem", None)

    @property
    def metadata(self):
        """See http://wiki.vg/Entities#Entity_Metadata_Format."""
        return getattr(self._raw, "metadata", None)

    @property
    def noClip(self):
        return getattr(self._raw, "noClip", None)

    @property
    def vehicle(self):
        """Entity that this entity is riding on."""
        return getattr(self._raw, "vehicle", None)

    @property
    def passenger(self):
        """Entity that is riding on this entity."""
        return getattr(self._raw, "passenger", None)

    @property
    def health(self):
        """Player health."""
        return getattr(self._raw, "health", -1)

    @property
    def food(self):
        """Player food level."""
        return getattr(self._raw, "food", -1)

    @property
    def elytraFlying(self):
        return getattr(self._raw, "elytraFlying", None)

    @property
    def player(self):
        """The player object itself."""
        return getattr(self._raw, "player", None)

    def getCustomName(self):
        """Returns a prismarine-chat ChatMessage object or None."""
        return getattr(self._raw, "getCustomName", lambda: None)()

    def getDroppedItem(self):
        """Returns a prismarine-item Item object if this is a dropped item, else None."""
        return getattr(self._raw, "getDroppedItem", lambda: None)()

    def __repr__(self):
        return str(self.displayName)


class Block(MineflayerClassAPIBase):
    """Blocks represent Minecraft blocks with all associated properties.

    See: https://github.com/PrismarineJS/prismarine-block
    """

    def __init__(self, o: "JavascriptObject"):
        super().__init__(o)

    @property
    def stateId(self):
        """Numeric ID representing this block and its state."""
        return getattr(self._raw, "stateId")

    @property
    def type(self):
        """Numeric ID representing block type."""
        return getattr(self._raw, "type")

    @property
    def name(self):
        """Internal unique block identifier."""
        return getattr(self._raw, "name")

    @property
    def displayName(self):
        """Formatted English name for this block."""
        return getattr(self._raw, "displayName")

    @property
    def position(self):
        """Position of the block."""
        return getattr(self._raw, "position")

    @property
    def shapes(self):
        """Bounding boxes representing block shape."""
        return getattr(self._raw, "shapes")

    @property
    def entity(self):
        """NBT data if this block is a block entity."""
        return getattr(self._raw, "entity", None)

    @property
    def blockEntity(self):
        """Simplified block entity data."""
        return getattr(self._raw, "blockEntity", None)

    @property
    def metadata(self):
        """Block metadata number (varies by block)."""
        return getattr(self._raw, "metadata")

    @property
    def hash(self):
        """[Bedrock Edition] hash representing block + properties."""
        return getattr(self._raw, "hash", None)

    @property
    def light(self):
        """Amount of block light emitted."""
        return getattr(self._raw, "light")

    @property
    def skyLight(self):
        """Amount of light from the sky."""
        return getattr(self._raw, "skyLight")

    @property
    def hardness(self):
        """Hardness value affecting dig speed."""
        return getattr(self._raw, "hardness")

    @property
    def biome(self):
        """Biome object instance."""
        return getattr(self._raw, "biome")

    @property
    def signText(self):
        """[sign block] Text."""
        return getattr(self._raw, "signText", None)

    @property
    def painting(self):
        """[painting block] Painting data (id, position, direction)."""
        return getattr(self._raw, "painting", None)

    @property
    def diggable(self):
        """True if block is considered diggable."""
        return getattr(self._raw, "diggable")

    @property
    def isWaterlogged(self):
        """True if block is waterlogged."""
        return getattr(self._raw, "isWaterlogged")

    @property
    def boundingBox(self):
        """Collision bounding box shape: 'block' or 'empty'."""
        return getattr(self._raw, "boundingBox")

    @property
    def transparent(self):
        """True if block texture has transparency."""
        return getattr(self._raw, "transparent")

    @property
    def material(self):
        """Block material type (rock, wood, dirt, etc.)."""
        return getattr(self._raw, "material")

    @property
    def harvestTools(self):
        """Set of tools that can harvest this block."""
        return getattr(self._raw, "harvestTools")

    @property
    def drops(self):
        """Items dropped by this block."""
        return getattr(self._raw, "drops")

    def __repr__(self):
        return str(self.displayName)
